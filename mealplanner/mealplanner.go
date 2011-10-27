package mealplanner

import (
	"http"
	"fmt"
	"appengine"
	"appengine/user"
	"appengine/datastore"
	"strings"
	"os"
	"io"
	"json"
	"unicode"
	//"bytes"
)

func init() {
	http.HandleFunc("/", errorHandler(indexHandler))
	http.HandleFunc("/dish", errorHandler(dishHandler))
	http.HandleFunc("/dish/", errorHandler(dishHandler))
	http.HandleFunc("/users", errorHandler(usersHandler))
	http.HandleFunc("/ingredient", errorHandler(ingredientHandler))
	http.HandleFunc("/ingredient/", errorHandler(ingredientHandler))
	http.HandleFunc("/search", errorHandler(searchHandler))
	http.HandleFunc("/tags", errorHandler(allTagsHandler))
	http.HandleFunc("/backup", errorHandler(backupHandler))
	http.HandleFunc("/restore", errorHandler(restoreHandler))
}

type handlerFunc func(c *context)

// errorHandler catches errors and prints an HTTP 500 error 
func errorHandler(handler handlerFunc) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		defer func() {
			if err, ok := recover().(os.Error); ok {
				w.WriteHeader(http.StatusInternalServerError)
				fmt.Fprintf(w, "%v", err)
			}
		}()
		c := newContext(w, r)
		handler(c)
	}
}
func check(err os.Error) {
	if err != nil {
		panic(err)
	}
}
func indexHandler(c *context) {
	c.w.Header().Set("Location", "/index.html")
	c.w.WriteHeader(http.StatusFound)
}
func usersHandler(c *context) {
	logoutURL, _ := user.LogoutURL(c.c, "/index.html")
	fmt.Fprintf(c.w, `[{ "Name" : "%v", "logoutURL" : "%v"}]`,
		c.u, logoutURL)
}
func dishHandler(c *context) {
	if strings.Contains(c.r.URL.Path, "/mi/") {
		measuredIngredientsHandler(c)
		if c.r.Method != "GET" {
			key,err := datastore.DecodeKey(getParentID(c.r))
			check(err)
			dish := Dish{}
			err = datastore.Get(c.c, key, &dish)
			check(err)
			updateDishKeywords(c.c, key, &dish)
		}
		return
	}
	if strings.Contains(c.r.URL.Path, "/tags/") {
		wordHandler(c, "Tags")
		if c.r.Method != "GET" {
			key,err := datastore.DecodeKey(getParentID(c.r))
			check(err)
			dish := Dish{}
			err = datastore.Get(c.c, key, &dish)
			check(err)
			updateDishKeywords(c.c, key, &dish)
		}
		return
	}
	if strings.Contains(c.r.URL.Path, "/keywords/") {
		wordHandler(c, "Keyword")
		return
	}
	if strings.Contains(c.r.URL.Path, "/pairing/") {
		pairingHandler(c)
		return
	}
	handler := newDataHandler(c, "Dish")
	id := getID(c.r)
	if len(id) == 0 {
		switch c.r.Method {
		case "GET":
			query := c.NewQuery("Dish").Order("Name")
			dishes := make([]Dish, 0, 100)
			keys, err := query.GetAll(handler.c, &dishes)
			check(err)
			for index, _ := range dishes {
				dishes[index].Id = keys[index]
			}
			sendJSON(handler.w, dishes)
		case "POST":
			dish := Dish{}
			savedContext := handler.c
			datastore.RunInTransaction(handler.c,
				func (tc appengine.Context) os.Error {
					handler.c = tc
					newKey := handler.createEntry(&dish, nil)
					updateDishKeywords(tc, newKey, &dish)
					return nil
				}, nil)
			handler.c = savedContext
		}
		return
	}
	key, err := datastore.DecodeKey(id)
	check(err)
	if key.Incomplete() {
		check(ErrUnknownItem)
	}
	handler.checkUser(key)
	dish := Dish{}
	switch c.r.Method {
	case "GET":
		handler.get(key, &dish)
	case "PUT":
		savedContext := handler.c
		datastore.RunInTransaction(handler.c,
			func (tc appengine.Context) os.Error {
				handler.c = tc
				handler.update(key, &dish)
				updateDishKeywords(tc, key, &dish)
				return nil
			}, nil)
		handler.c = savedContext
	case "DELETE":
		handler.delete(key)
	}
}

func addTags(tc appengine.Context, key *datastore.Key,
	words map[string]bool) {
	query := datastore.NewQuery("Tags").Ancestor(key)
	tags := make([]Word, 0, 20)
	_, err := query.GetAll(tc, &tags)
	check(err)
	for _, tag := range tags {
		addWords(tag.Word, words)
	}
}

// break up the text into words and add/remove keywords
//  for the dish
func updateDishKeywords(tc appengine.Context, key *datastore.Key,
	dish *Dish) {
	words := make(map[string]bool)
	addWords(dish.Name, words)
	addWords(dish.Source, words)
	addTags(tc, key, words)
	updateKeywords(tc, key, words)
}
func updateIngredientKeywords(tc appengine.Context, key *datastore.Key,
	ing *Ingredient) {
	words := make(map[string]bool)
	addWords(ing.Name, words)
	addWords(ing.Category, words)
	addTags(tc, key, words)
	updateKeywords(tc, key, words)
}

func addWords(text string, words map[string]bool) {
	spaced := strings.Map(func(rune int) int {
		if (unicode.IsPunct(rune)) {
			return ' '
		}
		return rune
	}, text)
	pieces := strings.Fields(spaced)
	for _, word := range pieces {
		if (len(word) > 1) {
			word = strings.ToLower(word)
			words[word] = false;
			if strings.HasSuffix(word, "s") {
				words[word[0:len(word)-1]] = false
				if strings.HasSuffix(word, "es") {
					words[word[0:len(word)-2]] = false
				}
			}
		}
	}
}

func updateKeywords(tc appengine.Context, key *datastore.Key, words map[string]bool) {
	query := datastore.NewQuery("Keyword").Ancestor(key)
	existingWords := make([]Word,0, 25)
	keys, err := query.GetAll(tc, &existingWords)
	check(err)
	for i, word := range existingWords {
		if _, ok := words[word.Word] ; ok {
			words[word.Word] = true
		} else {
			// this keyword isn't here any more
			datastore.Delete(tc, keys[i])
		}
	}
	for word, exists := range words {
		if !exists {
			newWord := Word{nil, word}
			newKey := datastore.NewKey(tc, "Keyword", "", 0, key)
			_, err := datastore.Put(tc, newKey, &newWord)
			check(err)
		}
	}
}

func measuredIngredientsHandler(c *context) {
	handler := newDataHandler(c, "MeasuredIngredient")
	id := getID(c.r)
	parent, err := datastore.DecodeKey(getParentID(c.r))
	check(err)
	c.checkUser(parent)
	if len(id) == 0 {
		switch c.r.Method {
		case "GET":
			query := c.NewQuery(handler.kind).Ancestor(parent).Order("Order")
			ingredients := make([]MeasuredIngredient, 0, 100)
			keys, err := query.GetAll(handler.c, &ingredients)
			check(err)
			for index, _ := range ingredients {
				ingredients[index].Id = keys[index]
			}
			sendJSON(handler.w, ingredients)
		case "POST":
			mi := MeasuredIngredient{}
			handler.createEntry(&mi, parent)
		}
		return
	}
	key, err := datastore.DecodeKey(id)
	check(err)
	if key.Incomplete() {
		check(ErrUnknownItem)
	}
	handler.checkUser(key)
	mi := MeasuredIngredient{}
	switch c.r.Method {
	case "GET":
		handler.get(key, &mi)
	case "PUT":
		handler.update(key, &mi)
	case "DELETE":
		handler.delete(key)
	}
}

func dishesForIngredientHandler(c *context) {
	handler := newDataHandler(c, "Dish")
	id := getID(c.r)
	ingKey,err := datastore.DecodeKey(getParentID(c.r))
	check(err)
	c.checkUser(ingKey)
	if len(id) == 0 {
		switch c.r.Method {
		case "GET":
			query := c.NewQuery("MeasuredIngredient").Filter("Ingredient =", ingKey).KeysOnly()
			keys, err := query.GetAll(handler.c, nil)
			check(err)
			dishes := make([]string, 0, 100)
			for _, key := range keys {
				dishes = append(dishes, key.Parent().Encode())
			}
			sendJSON(handler.w, dishes)
		}
		return
	}
}

func wordHandler(c *context, kind string) {
	handler := newDataHandler(c, kind)
	id := getID(c.r)
	parentKey,err := datastore.DecodeKey(getParentID(c.r))
	check(err)
	c.checkUser(parentKey)
	if len(id) == 0 {
		switch c.r.Method {
		case "GET":
			query := c.NewQuery(kind).Ancestor(parentKey)
			words := make([]Word, 0, 100)
			keys, err := query.GetAll(handler.c, &words)
			check(err)
			for index, _ := range words {
				words[index].SetID(keys[index])
			}
			sendJSON(handler.w, words)
		case "POST":
			word := Word{}
			handler.createEntry(&word, parentKey)
		}
		return
	}
	key, err := datastore.DecodeKey(id)
	check(err)
	handler.checkUser(key)
	word := Word{}
	switch c.r.Method {
	case "GET":
		handler.get(key, &word)
	case "PUT":
		handler.update(key, &word)
	case "DELETE":
		handler.delete(key)
	}
}

func pairingHandler(c *context) {
	kind := "Pairing"
	handler := newDataHandler(c, kind)
	id := getID(c.r)
	parentKey,err := datastore.DecodeKey(getParentID(c.r))
	check(err)
	c.checkUser(parentKey)
	if len(id) == 0 {
		switch c.r.Method {
		case "GET":
			query := c.NewQuery(kind).Ancestor(parentKey)
			pairs := make([]Pairing, 0, 20)
			keys, err := query.GetAll(handler.c, &pairs)
			check(err)
			for index, _ := range pairs {
				pairs[index].SetID(keys[index])
			}
			sendJSON(handler.w, pairs)
		case "POST":
			pairing := Pairing{}
			handler.createEntry(&pairing, parentKey)
			// create the matching entry
			other := pairing.Other
			newPairKey := datastore.NewKey(c.c, kind, "",0,other)
			pairing.Other = parentKey
			pairing.Id = nil
			newPairKey, err := datastore.Put(c.c, newPairKey, &pairing)
			check(err)
		}
		return
	}
	key, err := datastore.DecodeKey(id)
	check(err)
	handler.checkUser(key)
	pairing := Pairing{}
	switch c.r.Method {
	case "GET":
		handler.get(key, &pairing)
	case "PUT":
		// can't modify a pairing, only add/remove
		check(ErrUnsupported)
	case "DELETE":
		err = datastore.Get(c.c, key, &pairing)
		check(err)
		otherParent := pairing.Other
		query := datastore.NewQuery(kind).Ancestor(otherParent).Filter("Other=", parentKey).Filter("Description=",pairing.Description).KeysOnly()
		keys, err:= query.GetAll(c.c, nil)
		check(err)
		handler.delete(key)
		for _, otherKey := range keys {
			handler.delete(otherKey)
		}
	}
}

func ingredientHandler(c *context) {
	if strings.Contains(c.r.URL.Path, "/in/") {
		dishesForIngredientHandler(c)
		return
	}
	if strings.Contains(c.r.URL.Path, "/tags/") {
		wordHandler(c, "Tags")
		if c.r.Method != "GET" {
			key,err := datastore.DecodeKey(getParentID(c.r))
			check(err)
			ingredient := Ingredient{}
			err = datastore.Get(c.c, key, &ingredient)
			check(err)
			updateIngredientKeywords(c.c, key, &ingredient)
		}
		return
	}
	if strings.Contains(c.r.URL.Path, "/keywords/") {
		wordHandler(c, "Keyword")
		return
	}
	if strings.Contains(c.r.URL.Path, "/pairing/") {
		pairingHandler(c)
		return
	}
	handler := newDataHandler(c, "Ingredient")
	id := getID(c.r)
	if len(id) == 0 {
		switch c.r.Method {
		case "GET":
			query := c.NewQuery("Ingredient").Order("Name")
			ingredients := make([]Ingredient, 0, 100)
			keys, err := query.GetAll(handler.c, &ingredients)
			check(err)
			for index, _ := range ingredients {
				ingredients[index].Id = keys[index]
			}
			sendJSON(handler.w, ingredients)
		case "POST":
			ingredient := Ingredient{}
			savedContext := handler.c
			datastore.RunInTransaction(handler.c,
				func (tc appengine.Context) os.Error {
					handler.c = tc
					newKey := handler.createEntry(&ingredient, nil)
					updateIngredientKeywords(tc, newKey, &ingredient)
					return nil
				}, nil)
			handler.c = savedContext
		}
		return
	}
	key, err := datastore.DecodeKey(id)
	check(err)
	handler.checkUser(key)
	ingredient := Ingredient{}
	switch c.r.Method {
	case "GET":
		handler.get(key, &ingredient)
	case "PUT":
		savedContext := handler.c
		datastore.RunInTransaction(handler.c,
			func (tc appengine.Context) os.Error {
				handler.c = tc
				handler.update(key, &ingredient)
				updateIngredientKeywords(tc, key, &ingredient)
				return nil
			}, nil)
		handler.c = savedContext
	case "DELETE":
		handler.delete(key)
	}
}

func sendJSON(w http.ResponseWriter, object interface{}) {
	j, err := json.Marshal(object)
	check(err)
	w.Header().Set("Content-Type", "application/json")
	w.(io.Writer).Write(j)
}

func sendJSONIndent(w http.ResponseWriter, object interface{}) {
	j, err := json.MarshalIndent(object, "", "\t")
	check(err)
	w.Header().Set("Content-Type", "application/json")
	w.(io.Writer).Write(j)
}

func readJSON(r *http.Request, object interface{}) {
	err := json.NewDecoder(r.Body).Decode(object)
	check(err)
}

func getID(r *http.Request) string {
	parts := strings.Split(r.URL.Path, "/")
	if len(parts) < 3 {
		return ""
	}
	return parts[len(parts)-1]
}

func getParentID(r *http.Request) string {
	parts := strings.Split(r.URL.Path, "/")
	if len(parts) < 5 {
		return ""
	}
	return parts[len(parts)-3]
}

var (
	ErrUnknownItem = os.NewError("Unknown item")
	ErrUnsupported = os.NewError("Unsupported action")
)

type Ided interface {
	ID() *datastore.Key
	SetID(*datastore.Key)
}

type context struct {
	w    http.ResponseWriter
	r    *http.Request
	c    appengine.Context
	u    *user.User
	uid  string
	l	  *Library
}

type dataHandler struct {
	context
	kind string
}

func newContext(w http.ResponseWriter, r *http.Request) *context {
	c := appengine.NewContext(r)
	u := user.Current(c)
	uid := u.Id
	if (len(uid) == 0) {
		uid = u.Email
	}
	query := datastore.NewQuery("Library").Filter("OwnerId =", uid)
	libs := make([]Library, 0, 1)
	keys, err := query.GetAll(c, &libs)
	check(err)
	var l *Library
	if (len(libs) == 0) {
		key := datastore.NewKey(c, "Library", "", 0, nil)
		l = &Library{nil, uid, 0}
		newKey, err := datastore.Put(c, key, l)
		check(err)
		l.Id = newKey
	} else {
		l = &libs[0]
		l.Id = keys[0]
	}
	return &context{w, r, c, u, uid, l}
}

func (self *context) checkUser(key *datastore.Key) {
	if !self.isInLibrary(key) {
		check(ErrUnknownItem)
	}
}
func (self *context) isInLibrary(key *datastore.Key) bool {
	// check if the library is an ancestor of this key
	for key != nil {
		if (self.l.Id.Eq(key)) {
			return true
		}
		key = key.Parent()
	}
	return false
}
// create a new query always filtering on the library in use
func (self *context) NewQuery(kind string) *datastore.Query {
	return datastore.NewQuery(kind).Ancestor(self.l.Id)
}

func newDataHandler(c *context, kind string) *dataHandler {
	return &dataHandler{*c, kind}
}

func (self *dataHandler) createEntry(newObject interface{}, parent *datastore.Key) *datastore.Key {
	// use the library as parent if we don't have an immediate
	// parent
	if (parent == nil) {
		parent = self.l.Id
	}
	r := self.r
	c := self.c
	ided, ok := newObject.(Ided)
	if !ok {
		check(datastore.ErrInvalidEntityType)
	}
	readJSON(r, newObject)
	key := datastore.NewKey(c, self.kind, "", 0, parent)
	key, err := datastore.Put(c, key, newObject)
	check(err)
	ided.SetID(key)
	sendJSON(self.w, newObject)
	return key
}
func (self *dataHandler) get(key *datastore.Key, object interface{}) {
	err := datastore.Get(self.c, key, object)
	check(err)
	self.w.Header().Set("Content-Type", "application/json")
	ided, ok := object.(Ided)
	if !ok {
		check(datastore.ErrInvalidEntityType)
	}
	ided.SetID(key)
	sendJSON(self.w, object)
}
func (self *dataHandler) update(key *datastore.Key, object interface{}) {
	readJSON(self.r, object)
	// don't let user change the USER or ID
	ided, ok := object.(Ided)
	if !ok {
		check(datastore.ErrInvalidEntityType)
	}
	ided.SetID(key)
	_, err := datastore.Put(self.c, key, object)
	check(err)
	sendJSON(self.w, object)
}

func (self *dataHandler) delete(key *datastore.Key) {
	err := datastore.Delete(self.c, key)
	check(err)
}

type searchParams struct {
	Tags   []string
	Rating int
	Word   string
}

func addResult(key *datastore.Key, results map[string]map[string] uint) {
	parent := key.Parent()
	parentEnc := parent.Encode()
	if kind, ok := results[parent.Kind()]; ok {
		if _, ok := kind[parentEnc]; ok {
			kind[parentEnc] += 1
		} else {
			kind[parentEnc] = 1
		}
	} else {
		results[parent.Kind()] = make(map[string] uint)
		results[parent.Kind()][parentEnc] = 1
	}
}
func addResults(keys []*datastore.Key, results map[string]map[string] uint) {
	for _, key := range keys {
		addResult(key, results)
	}
}

func searchHandler(c *context) {
	sp := searchParams{}
	readJSON(c.r, &sp)
	results := make(map[string]map[string] uint)

	// TODO parallelize
	for _, target :=range sp.Tags {
		query := c.NewQuery("Tags").Filter("Word=", target).KeysOnly()
		keys, err := query.GetAll(c.c, nil)
		check(err)
		addResults(keys, results)
	}

	// handle word search
	if len(sp.Word) > 0 {
		// break the query into words
		terms := make(map[string]bool)
		addWords(sp.Word, terms)
		// search for each word
		for target, _ :=range terms {
			query := c.NewQuery("Keyword").Filter("Word=", target).KeysOnly()
			keys, err := query.GetAll(c.c, nil)
			check(err)
			addResults(keys, results)
		}
	}

	if ings, ok := results["Ingredient"]; ok {
		for ing, _ := range ings {
			ingKey, err := datastore.DecodeKey(ing)
			check(err)
			// carry results forward to list dishes that have the ingredients that matched
			query := c.NewQuery("MeasuredIngredient").Filter("Ingredient =", ingKey).KeysOnly()
			keys, err := query.GetAll(c.c, nil)
			check(err)
			addResults(keys, results)
		}
	}

	sendJSON(c.w, results)
}

func allTagsHandler(c *context) {
	tags := make([]string, 0, 100)
	// order by the tag name, so we can skip duplicates
	query := c.NewQuery("Tags").Order("Word")
	results := make([]Word, 0, 100)
	_, err := query.GetAll(c.c, &results)
	check(err)
	lastTag := ""
	for _, tag := range results {
		if (tag.Word != lastTag) {
			tags = append(tags, tag.Word)
			lastTag = tag.Word
		}
	}
	sendJSON(c.w, tags)
}

type backup struct {
	Dishes              []Dish
	Ingredients         []Ingredient
	MeasuredIngredients map[string][]MeasuredIngredient
	Tags map[string][]Word
}

func backupHandler(c *context) {
	b := backup{}
	b.MeasuredIngredients = map[string][]MeasuredIngredient{}
	b.Tags = map[string][]Word{}

	query := c.NewQuery("Dish")
	keys, err := query.GetAll(c.c, &b.Dishes)
	check(err)
	for index, _ := range b.Dishes {
		key := keys[index]
		b.Dishes[index].Id = key
		ingredients := make([]MeasuredIngredient, 0, 100)
		query = c.NewQuery("MeasuredIngredient").Ancestor(key).Order("Order")
		ikeys, err := query.GetAll(c.c, &ingredients)
		check(err)
		for iindex, _ := range ingredients {
			ingredients[iindex].Id = ikeys[iindex]
		}
		if len(ingredients) > 0 {
			b.MeasuredIngredients[key.Encode()] = ingredients
		}
		tags := make([]Word, 0, 10)
		query = c.NewQuery("Tags").Ancestor(key)
		tkeys, err := query.GetAll(c.c, &tags)
		check(err)
		for tindex, _ := range tags {
			tags[tindex].Id = tkeys[tindex]
		}
		if len(tags) > 0 {
			b.Tags[key.Encode()] = tags
		}
	}
	query = c.NewQuery("Ingredient")
	keys, err = query.GetAll(c.c, &b.Ingredients)
	check(err)
	for index, _ := range b.Ingredients {
		key := keys[index]
		b.Ingredients[index].Id = key
		tags := make([]Word, 0, 10)
		query = c.NewQuery("Tags").Ancestor(key)
		tkeys, err := query.GetAll(c.c, &tags)
		check(err)
		for tindex, _ := range tags {
			tags[tindex].Id = tkeys[tindex]
		}
		if len(tags) > 0 {
			b.Tags[key.Encode()] = tags
		}
	}
	sendJSONIndent(c.w, b)
}

func restoreKey(tc appengine.Context, c *context,
               key *datastore.Key,
					fixUpKeys map[string]*datastore.Key) *datastore.Key {
	encoded := key.Encode()
	if newKey, found := fixUpKeys[encoded]; found {
		return newKey
	}
	if !c.isInLibrary(key) {
		newKey := datastore.NewKey(tc, key.Kind(), "", 0, c.l.Id)
		fixUpKeys[encoded] = newKey
		return newKey
	}
	return key
}

func restore(tc appengine.Context, c *context) os.Error {
	file, _, err := c.r.FormFile("restore-file")
	check(err)
	decoder := json.NewDecoder(file)
	data := backup{}
	err = decoder.Decode(&data)
	check(err)
	fixUpKeys := make(map[string]*datastore.Key)
	// add all the ingredients
	for _, i := range data.Ingredients {
		key := restoreKey(tc, c, i.Id, fixUpKeys)
		newKey, err := datastore.Put(tc, key, &i)
		check(err)
		if !i.Id.Eq(newKey) {
			fixUpKeys[i.Id.Encode()] = newKey
		}
		updateIngredientKeywords(tc, newKey, &i)
	}
	// add all the dishes
	for _, d := range data.Dishes {
		key := restoreKey(tc, c, d.Id, fixUpKeys)
		newKey, err := datastore.Put(tc, key, &d)
		check(err)
		if !d.Id.Eq(newKey) {
			fixUpKeys[d.Id.Encode()] = newKey
		}
		updateDishKeywords(tc, newKey, &d)
	}
	// add all the dishes' ingredients
	for d, ingredients := range data.MeasuredIngredients {
		temp, err := datastore.DecodeKey(d)
		check(err)
		parent := restoreKey(tc, c, temp, fixUpKeys)
		for _, i := range ingredients {
			i.Ingredient = restoreKey(tc, c, i.Ingredient, fixUpKeys)
			if !c.isInLibrary(i.Id) {
				i.Id = datastore.NewKey(tc, "MeasuredIngredient", "", 0, parent)
			}
			_, err = datastore.Put(tc, i.Id, &i)
			check(err)
		}
	}
	// add all the tags
	for id, tags := range data.Tags {
		temp, err := datastore.DecodeKey(id)
		check(err)
		parent := restoreKey(tc, c, temp, fixUpKeys)
		for _, t := range tags {
			if !c.isInLibrary(t.Id) {
				t.Id = datastore.NewKey(tc, "Tags", "", 0, parent)
			}
			_, err = datastore.Put(tc, t.Id, &t)
			check(err)
		}
	}
	indexHandler(c)
	return nil
}

func restoreHandler(c *context) {
	datastore.RunInTransaction(c.c,
		func (tc appengine.Context) os.Error {
			return restore(tc, c);
	}, nil)
	return
}
