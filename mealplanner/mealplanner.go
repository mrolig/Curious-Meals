package mealplanner

import (
	"http"
	"fmt"
	"appengine"
	"appengine/user"
	"appengine/datastore"
	"appengine/mail"
	"strings"
	"os"
	"io"
	"json"
	"unicode"
	"time"
)

func init() {
	http.HandleFunc("/", errorHandler(indexHandler))
	http.HandleFunc("/dish", permHandler(dishHandler))
	http.HandleFunc("/dish/", permHandler(dishHandler))
	http.HandleFunc("/users", permHandler(usersHandler))
	http.HandleFunc("/ingredient", permHandler(ingredientHandler))
	http.HandleFunc("/ingredient/", permHandler(ingredientHandler))
	http.HandleFunc("/menu/", permHandler(menuHandler))
	// search uses POST for a read, we don't use permHandler because
	// it would block searches of readonly libraries
	http.HandleFunc("/search", errorHandler(searchHandler))
	http.HandleFunc("/tags", permHandler(allTagsHandler))
	http.HandleFunc("/backup", permHandler(backupHandler))
	http.HandleFunc("/restore", permHandler(restoreHandler))
	http.HandleFunc("/share/", errorHandler(shareHandler))
	http.HandleFunc("/shareAccept/", errorHandler(shareAcceptHandler))
	http.HandleFunc("/libraries", errorHandler(librariesHandler))
	http.HandleFunc("/switch/", errorHandler(switchHandler))
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
// permHandler wraps errorHandler and also checks for non-GET methods
//  being used with a read-only library
func permHandler(handler handlerFunc) http.HandlerFunc {
	return errorHandler(func(c *context) {
		if c.readOnly && c.r.Method != "GET" {
			check(os.EPERM)
		}
		handler(c)
	})
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
			key, err := datastore.DecodeKey(getParentID(c.r))
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
			key, err := datastore.DecodeKey(getParentID(c.r))
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
				dishes[index].Id = keys[index].Encode()
			}
			sendJSON(handler.w, dishes)
		case "POST":
			dish := Dish{}
			newKey := handler.createEntry(&dish, nil)
			updateDishKeywords(c.c, newKey, &dish)
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
		handler.update(key, &dish)
		updateDishKeywords(c.c, key, &dish)
	case "DELETE":
		handler.delete(key)
	}
}

func addTags(c appengine.Context, key *datastore.Key,
words map[string]bool) {
	query := datastore.NewQuery("Tags").Ancestor(key)
	tags := make([]Word, 0, 20)
	_, err := query.GetAll(c, &tags)
	check(err)
	for _, tag := range tags {
		addWords(tag.Word, words)
	}
}

// break up the text into words and add/remove keywords
//  for the dish
func updateDishKeywords(c appengine.Context, key *datastore.Key,
dish *Dish) {
	words := make(map[string]bool)
	addWords(dish.Name, words)
	addWords(dish.Source, words)
	addTags(c, key, words)
	updateKeywords(c, key, words)
}
func updateIngredientKeywords(c appengine.Context, key *datastore.Key,
ing *Ingredient) {
	words := make(map[string]bool)
	addWords(ing.Name, words)
	addWords(ing.Category, words)
	addTags(c, key, words)
	updateKeywords(c, key, words)
}

func addWords(text string, words map[string]bool) {
	spaced := strings.Map(func(rune int) int {
		if unicode.IsPunct(rune) {
			return ' '
		}
		return rune
	}, text)
	pieces := strings.Fields(spaced)
	for _, word := range pieces {
		if len(word) > 1 {
			word = strings.ToLower(word)
			words[word] = false
			if strings.HasSuffix(word, "s") {
				words[word[0:len(word)-1]] = false
				if strings.HasSuffix(word, "es") {
					words[word[0:len(word)-2]] = false
				}
			}
		}
	}
}

func updateKeywords(c appengine.Context, key *datastore.Key, words map[string]bool) {
	query := datastore.NewQuery("Keyword").Ancestor(key)
	existingWords := make([]Word, 0, 25)
	keys, err := query.GetAll(c, &existingWords)
	check(err)
	for i, word := range existingWords {
		if _, ok := words[word.Word]; ok {
			words[word.Word] = true
		} else {
			// this keyword isn't here any more
			datastore.Delete(c, keys[i])
		}
	}
	for word, exists := range words {
		if !exists {
			newWord := Word{"", word}
			newKey := datastore.NewKey(c, "Keyword", "", 0, key)
			_, err := datastore.Put(c, newKey, &newWord)
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
				ingredients[index].Id = keys[index].Encode()
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
	ingKey, err := datastore.DecodeKey(getParentID(c.r))
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
	parentKey, err := datastore.DecodeKey(getParentID(c.r))
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
				words[index].SetID(keys[index].Encode())
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
	parentKey, err := datastore.DecodeKey(getParentID(c.r))
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
				pairs[index].SetID(keys[index].Encode())
			}
			sendJSON(handler.w, pairs)
		case "POST":
			pairing := Pairing{}
			handler.createEntry(&pairing, parentKey)
			// create the matching entry
			other := pairing.Other
			newPairKey := datastore.NewKey(c.c, kind, "", 0, other)
			pairing.Other = parentKey
			pairing.Id = ""
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
		query := datastore.NewQuery(kind).Ancestor(otherParent).Filter("Other=", parentKey).Filter("Description=", pairing.Description).KeysOnly()
		keys, err := query.GetAll(c.c, nil)
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
			key, err := datastore.DecodeKey(getParentID(c.r))
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
				ingredients[index].Id = keys[index].Encode()
			}
			sendJSON(handler.w, ingredients)
		case "POST":
			ingredient := Ingredient{}
			newKey := handler.createEntry(&ingredient, nil)
			updateIngredientKeywords(c.c, newKey, &ingredient)
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
		handler.update(key, &ingredient)
		updateIngredientKeywords(c.c, key, &ingredient)
	case "DELETE":
		handler.delete(key)
	}
}

func menuHandler(c *context) {
	if strings.Contains(c.r.URL.Path, "/tags/") {
		wordHandler(c, "Tags")
		return
	}
	handler := newDataHandler(c, "Menu")
	id := getID(c.r)
	if len(id) == 0 {
		switch c.r.Method {
		case "GET":
			query := c.NewQuery("Menu").Order("Name")
			menus := make([]Menu, 0, 100)
			keys, err := query.GetAll(handler.c, &menus)
			check(err)
			for index, _ := range menus {
				menus[index].Id = keys[index].Encode()
			}
			sendJSON(handler.w, menus)
		case "POST":
			menu := Menu{}
			handler.createEntry(&menu, nil)
		}
		return
	}
	key, err := datastore.DecodeKey(id)
	check(err)
	handler.checkUser(key)
	menu := Menu{}
	switch c.r.Method {
	case "GET":
		handler.get(key, &menu)
	case "PUT":
		handler.update(key, &menu)
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
	ID() string
	SetID(string)
}

type context struct {
	w        http.ResponseWriter
	r        *http.Request
	c        appengine.Context
	u        *user.User
	uid      string
	l        *Library
	lid      *datastore.Key
	readOnly bool
}

type dataHandler struct {
	context
	kind string
}

func (self *context) getUid() string {
	uid := self.u.Id
	if len(uid) == 0 {
		uid = self.u.Email
	}
	return uid
}

func newContext(w http.ResponseWriter, r *http.Request) *context {
	c := appengine.NewContext(r)
	u := user.Current(c)
	uid := u.Id
	if len(uid) == 0 {
		uid = u.Email
	}
	query := datastore.NewQuery("Library").Filter("OwnerId =", uid).Limit(1)
	libs := make([]Library, 0, 1)
	keys, err := query.GetAll(c, &libs)
	check(err)
	var l *Library
	readOnly := false
	init := false
	var lid *datastore.Key
	if len(libs) == 0 {
		key := datastore.NewKey(c, "Library", "", 0, nil)
		l = &Library{uid, 0, u.String(), ""}
		lid, err = datastore.Put(c, key, l)
		check(err)
		init = true
	} else {
		l = &libs[0]
		lid = keys[0]
		upl, err := datastore.DecodeKey(libs[0].UserPreferredLibrary)
		if err != nil {
			upl = nil
		}
		// use an alternate library if the user wants to
		if upl != nil && !keys[0].Eq(upl) {
			query = datastore.NewQuery("Perm").Ancestor(upl).Filter("UserId =", uid).Limit(1)
			perms := make([]Perm, 0, 1)
			permKeys, err := query.GetAll(c, &perms)
			check(err)
			if len(permKeys) > 0 {
				// we have permission for this other library, fetch it
				readOnly = perms[0].ReadOnly
				err = datastore.Get(c, upl, l)
				check(err)
				lid = upl
			}
		}
	}
	ctxt := &context{w, r, c, u, uid, l, lid, readOnly}
	if init {
		file, err := os.Open("static/base.json")
		if err != nil {
			restore(ctxt, file)
		}
	}
	return ctxt
}

func (self *context) checkUser(key *datastore.Key) {
	if !self.isInLibrary(key) {
		check(ErrUnknownItem)
	}
}
func (self *context) isInLibrary(key *datastore.Key) bool {
	// check if the library is an ancestor of this key
	for key != nil {
		if self.lid.Eq(key) {
			return true
		}
		key = key.Parent()
	}
	return false
}
// create a new query always filtering on the library in use
func (self *context) NewQuery(kind string) *datastore.Query {
	return datastore.NewQuery(kind).Ancestor(self.lid)
}

func newDataHandler(c *context, kind string) *dataHandler {
	return &dataHandler{*c, kind}
}

func (self *dataHandler) createEntry(newObject interface{}, parent *datastore.Key) *datastore.Key {
	// use the library as parent if we don't have an immediate
	// parent
	if parent == nil {
		parent = self.lid
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
	ided.SetID(key.Encode())
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
	ided.SetID(key.Encode())
	sendJSON(self.w, object)
}
func (self *dataHandler) update(key *datastore.Key, object interface{}) {
	readJSON(self.r, object)
	// don't let user change the USER or ID
	ided, ok := object.(Ided)
	if !ok {
		check(datastore.ErrInvalidEntityType)
	}
	ided.SetID(key.Encode())
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

func addResult(key *datastore.Key, results map[string]map[string]uint) {
	parent := key.Parent()
	parentEnc := parent.Encode()
	if kind, ok := results[parent.Kind()]; ok {
		if _, ok := kind[parentEnc]; ok {
			kind[parentEnc] += 1
		} else {
			kind[parentEnc] = 1
		}
	} else {
		results[parent.Kind()] = make(map[string]uint)
		results[parent.Kind()][parentEnc] = 1
	}
}
func addResults(keys []*datastore.Key, results map[string]map[string]uint) {
	for _, key := range keys {
		addResult(key, results)
	}
}
// take the results from /count/ queries from the /resultsChannel/
//  and perform an intersection
func mergeResults(resultsChannel chan map[string]map[string]uint,
count uint) map[string]map[string]uint {
	if count == 0 {
		return make(map[string]map[string]uint)
	}
	// start with the first map we get
	results := <-resultsChannel
	count--
	for count > 0 {
		results2 := <-resultsChannel
		results1 := results
		results = make(map[string]map[string]uint)
		for kind, ids1 := range results1 {
			if ids2, ok := results2[kind]; ok {
				ids := make(map[string]uint)
				for id1, cnt1 := range ids1 {
					if cnt2, ok := ids2[id1]; ok {
						ids[id1] = cnt1 + cnt2
					}
				}
				results[kind] = ids
			}
		}
		count--
	}
	return results
}

func searchHandler(c *context) {
	sp := searchParams{}
	readJSON(c.r, &sp)
	resultsChannel := make(chan map[string]map[string]uint)
	var queries uint = 0

	if len(sp.Tags) > 0 {
		// start a search for items with all specified tags
		for _, target := range sp.Tags {
			go func() {
				query := c.NewQuery("Tags").KeysOnly()
				query.Filter("Word=", target)
				keys, err := query.GetAll(c.c, nil)
				check(err)
				results := make(map[string]map[string]uint)
				addResults(keys, results)
				resultsChannel <- results
			}()
			queries++
		}
	}

	// handle word search
	if len(sp.Word) > 0 {
		go func() {
			results := make(map[string]map[string]uint)
			// break the query into words
			terms := make(map[string]bool)
			addWords(sp.Word, terms)
			// search for each word
			for target, _ := range terms {
				query := c.NewQuery("Keyword").Filter("Word=", target).KeysOnly()
				keys, err := query.GetAll(c.c, nil)
				check(err)
				addResults(keys, results)
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
			resultsChannel <- results
		}()
		queries++
	}

	results := mergeResults(resultsChannel, queries)
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
		if tag.Word != lastTag {
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
	Tags                map[string][]Word
	Pairings            map[string][]Pairing
	Menus               []Menu
}

func backupHandler(c *context) {
	b := backup{}
	b.MeasuredIngredients = map[string][]MeasuredIngredient{}
	b.Tags = map[string][]Word{}
	b.Pairings = map[string][]Pairing{}

	query := c.NewQuery("Dish")
	keys, err := query.GetAll(c.c, &b.Dishes)
	check(err)
	for index, _ := range b.Dishes {
		key := keys[index]
		b.Dishes[index].Id = key.Encode()
		ingredients := make([]MeasuredIngredient, 0, 100)
		query = c.NewQuery("MeasuredIngredient").Ancestor(key).Order("Order")
		ikeys, err := query.GetAll(c.c, &ingredients)
		check(err)
		for iindex, _ := range ingredients {
			ingredients[iindex].Id = ikeys[iindex].Encode()
		}
		if len(ingredients) > 0 {
			b.MeasuredIngredients[key.Encode()] = ingredients
		}
		tags := make([]Word, 0, 10)
		query = c.NewQuery("Tags").Ancestor(key)
		tkeys, err := query.GetAll(c.c, &tags)
		check(err)
		for tindex, _ := range tags {
			tags[tindex].Id = tkeys[tindex].Encode()
		}
		if len(tags) > 0 {
			b.Tags[key.Encode()] = tags
		}
		pairings := make([]Pairing, 0, 10)
		query = c.NewQuery("Pairing").Ancestor(key)
		pkeys, err := query.GetAll(c.c, &pairings)
		check(err)
		for pindex, _ := range pairings {
			pairings[pindex].Id = pkeys[pindex].Encode()
		}
		if len(pairings) > 0 {
			b.Pairings[key.Encode()] = pairings
		}
	}
	query = c.NewQuery("Ingredient")
	keys, err = query.GetAll(c.c, &b.Ingredients)
	check(err)
	for index, _ := range b.Ingredients {
		key := keys[index]
		b.Ingredients[index].Id = key.Encode()
		tags := make([]Word, 0, 10)
		query = c.NewQuery("Tags").Ancestor(key)
		tkeys, err := query.GetAll(c.c, &tags)
		check(err)
		for tindex, _ := range tags {
			tags[tindex].Id = tkeys[tindex].Encode()
		}
		if len(tags) > 0 {
			b.Tags[key.Encode()] = tags
		}
		pairings := make([]Pairing, 0, 10)
		query = c.NewQuery("Pairing").Ancestor(key)
		pkeys, err := query.GetAll(c.c, &pairings)
		check(err)
		for pindex, _ := range pairings {
			pairings[pindex].Id = pkeys[pindex].Encode()
		}
		if len(pairings) > 0 {
			b.Pairings[key.Encode()] = pairings
		}
	}
	query = c.NewQuery("Menu")
	keys, err = query.GetAll(c.c, &b.Menus)
	check(err)
	for index, _ := range b.Menus {
		key := keys[index]
		b.Menus[index].SetID(key.Encode())
	}
	sendJSONIndent(c.w, b)
}

func restoreKey(c *context,
encoded string,
fixUpKeys map[string]*datastore.Key) *datastore.Key {
	key, err := datastore.DecodeKey(encoded)
	check(err) 
	if newKey, found := fixUpKeys[encoded]; found {
		return newKey
	}
	if !c.isInLibrary(key) {
		newKey := datastore.NewKey(c.c, key.Kind(), "", 0, c.lid)
		fixUpKeys[encoded] = newKey
		return newKey
	}
	return key
}

func restoreTags(c *context,
allTags map[string][]Word,
origid string,
newParentKey *datastore.Key) {
	// first, get the tags for this item
	if tags, ok := allTags[origid]; ok {
		// loop through all the tags and add them
		for _, t := range tags {
			key, err := datastore.DecodeKey(t.Id)
			check(err)
			if !c.isInLibrary(key) {
				key = datastore.NewKey(c.c, "Tags", "", 0, newParentKey)
			}
			t.Id = ""
			_, err = datastore.Put(c.c, key, &t)
			check(err)
		}
	}
}

func restore(c *context, file io.Reader) os.Error {
	decoder := json.NewDecoder(file)
	data := backup{}
	err := decoder.Decode(&data)
	check(err)
	fixUpKeys := make(map[string]*datastore.Key)
	// add all the ingredients
	for _, i := range data.Ingredients {
		id := i.Id
		key := restoreKey(c, id, fixUpKeys)
		if key.Incomplete() {
			// check if we have an item of the same name already
			iquery := c.NewQuery("Ingredient").Filter("Name=", i.Name).KeysOnly().Limit(1)
			ikeys, err := iquery.GetAll(c.c, nil)
			check(err)
			if len(ikeys) > 0 {
				// we found a match, use that key so we'll overwrite that one
				key = ikeys[0]
			}
		}
		i.Id = ""
		newKey, err := datastore.Put(c.c, key, &i)
		check(err)
		fixUpKeys[id] = newKey
		restoreTags(c, data.Tags, id, newKey)
		updateIngredientKeywords(c.c, newKey, &i)
	}
	// add all the dishes
	for _, d := range data.Dishes {
		id := d.Id
		key := restoreKey(c, id, fixUpKeys)
		d.Id = ""
		newKey, err := datastore.Put(c.c, key, &d)
		check(err)
		fixUpKeys[id] = newKey
		restoreTags(c, data.Tags, id, newKey)
		updateDishKeywords(c.c, newKey, &d)
	}
	// add all the dishes' ingredients
	for d, ingredients := range data.MeasuredIngredients {
		parent := restoreKey(c, d, fixUpKeys)
		for _, i := range ingredients {
			id:= i.Id
			i.Ingredient = restoreKey(c, i.Ingredient.Encode(), fixUpKeys)
			key, err:= datastore.DecodeKey(id)
			check(err)
			if !c.isInLibrary(key) {
				key = datastore.NewKey(c.c, "MeasuredIngredient", "", 0, parent)
			}
			i.Id = ""
			_, err = datastore.Put(c.c, key, &i)
			check(err)
		}
	}
	// add all the dishes' pairings
	for d, pairings := range data.Pairings {
		parent := restoreKey(c, d, fixUpKeys)
		for _, i := range pairings {
			id := i.Id
			i.Other = restoreKey(c, i.Other.Encode(), fixUpKeys)
			key, err := datastore.DecodeKey(id)
			if !c.isInLibrary(key) {
				key = datastore.NewKey(c.c, "Pairing", "", 0, parent)
			}
			i.Id = ""
			_, err = datastore.Put(c.c, key, &i)
			check(err)
		}
	}
	// add all the menus
	for _, m := range data.Menus {
		id := m.Id
		key := restoreKey(c, id, fixUpKeys)
		for index, dishKey := range m.Dishes {
			m.Dishes[index] = restoreKey(c, dishKey.Encode(), fixUpKeys)
		}
		m.Id = ""
		newKey, err := datastore.Put(c.c, key, &m)
		check(err)
		fixUpKeys[id] = newKey
		restoreTags(c, data.Tags, id, newKey)
	}
	indexHandler(c)
	return nil
}

func restoreHandler(c *context) {
	file, _, err := c.r.FormFile("restore-file")
	check(err)
	restore(c, file)
}

func shareHandler(c *context) {
	// create a request to share the library
	// form: /share/read/email/other@email.address.com
	// form: /share/write/email/other@email.address.com
	uid := c.getUid()
	// verify the user owns this library
	if uid != c.l.OwnerId {
		check(os.EPERM)
	}
	var email = getID(c.r)
	var permStr = getParentID(c.r)
	share := Share{
		ExpirationDate: time.Seconds() + 30*24*60*60,
		ReadOnly:       permStr != "write",
	}
	key := datastore.NewKey(c.c, "Share", "", 0, c.lid)
	key, err := datastore.Put(c.c, key, &share)
	check(err)
	subject := email + " would like to share a meal-planning library with you"
	body := subject + ".\n\nFollow this link to gain access to the library: http://" + c.r.Header.Get("Host") + "/shareAccept/" + key.Encode()

	msg := mail.Message{
		Sender:  c.u.Email,
		To:      []string{email},
		Subject: subject,
		Body:    body,
	}
	if err := mail.Send(c.c, &msg); err != nil {
		fmt.Fprintf(c.w, "Failed to send an email message to '%v'. %v", email, err)
		datastore.Delete(c.c, key)
	}
}

func shareAcceptHandler(c *context) {
	key, err := datastore.DecodeKey(getID(c.r))
	if err != nil {
		fmt.Fprintf(c.w, "{\"Error\":\"Invalid key, please check your email to ensure you typed the URL correctly.\"}")
		return
	}
	share := Share{}
	err = datastore.Get(c.c, key, &share)
	if err != nil {
		fmt.Fprintf(c.w, "This invitation has expired, please ensure you typed the URL correctly or contact the sender to retry.")
		return
	}
	libKey := key.Parent()
	uid := c.getUid()
	// remove any previous permissions the user had to the library
	delQuery := datastore.NewQuery("Perm").Ancestor(libKey).Filter("UserId=", uid).KeysOnly()
	delKeys, err := delQuery.GetAll(c.c, nil)
	if err == nil && len(delKeys) > 0 {
		datastore.DeleteMulti(c.c, delKeys)
	}
	// create the permission for the user to access the library
	perm := Perm{UserId: uid, ReadOnly: share.ReadOnly}
	permKey := datastore.NewKey(c.c, "Perm", "", 0, libKey)
	permKey, err = datastore.Put(c.c, permKey, &perm)
	if err != nil {
		fmt.Fprintf(c.w, "We're sorry, the service failed to complete this operation, please try again.")
		return
	}
	// delete the share request so it can't be used again
	datastore.Delete(c.c, key)

	// update the user's record to use the shared library
	c.l.UserPreferredLibrary = libKey.Encode()
	datastore.Put(c.c, c.lid, c.l)
	indexHandler(c)
}

type UserLibrary struct {
	Id       *datastore.Key
	Name     string
	ReadOnly bool
	Current  bool
	Owner    bool
}
// return a list of libraries this user can access
func librariesHandler(c *context) {
	uid := c.getUid()
	query := datastore.NewQuery("Library").Filter("OwnerId =", uid).Limit(1)
	libs := make([]Library, 0, 1)
	keys, err := query.GetAll(c.c, &libs)
	check(err)
	libraries := make([]UserLibrary, 0, 10)
	libraries = append(libraries, UserLibrary{keys[0], libs[0].Name, false,
		keys[0].Eq(c.lid), true})
	perms := make([]Perm, 0, 10)
	query = datastore.NewQuery("Perm").Filter("UserId=", uid)
	keys, err = query.GetAll(c.c, &perms)
	check(err)
	for index, _ := range keys {
		lib := Library{}
		libkey := keys[index].Parent()
		err = datastore.Get(c.c, libkey, &lib)
		check(err)
		ul := UserLibrary{libkey, lib.Name, perms[index].ReadOnly,
			libkey.Eq(c.lid), false}
		if len(ul.Name) == 0 {
			ul.Name = lib.OwnerId
		}
		libraries = append(libraries, ul)
	}
	sendJSON(c.w, libraries)
}

// handler to switch which library the user is looking at
func switchHandler(c *context) {
	uid := c.getUid()
	desiredKey, err := datastore.DecodeKey(getID(c.r))
	check(err)
	if desiredKey.Kind() != "Library" {
		check(ErrUnknownItem)
	}
	// start by getting the user's own library
	query := datastore.NewQuery("Library").Filter("OwnerId =", uid).Limit(1)
	libs := make([]Library, 0, 1)
	keys, err := query.GetAll(c.c, &libs)
	check(err)
	if len(libs) == 0 {
		return
	}
	if !keys[0].Eq(desiredKey) {
		// user want's to see someone else's library, check if they have
		// permission
		query = datastore.NewQuery("Perm").Ancestor(desiredKey).Filter("UserId=", uid).Limit(1).KeysOnly()
		pkeys, err := query.GetAll(c.c, nil)
		check(err)
		if len(pkeys) == 0 {
			check(os.EPERM)
			return
		}
	} else {
		// we use nil to indicate the user wants their own library
		desiredKey = nil
	}
	// we verified that the desiredKey is a library the user has permission to access
	//  save their preference
	if desiredKey != nil {
		libs[0].UserPreferredLibrary = desiredKey.Encode()
	} else {
		libs[0].UserPreferredLibrary = ""
	}
	_, err = datastore.Put(c.c, keys[0], &libs[0])
	check(err)
	indexHandler(c)
}
