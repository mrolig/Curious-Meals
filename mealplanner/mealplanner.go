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
		return
	}
	if strings.Contains(c.r.URL.Path, "/tags/") {
		wordHandler(c, "Tags")
		return
	}
	if strings.Contains(c.r.URL.Path, "/keywords/") {
		wordHandler(c, "Keyword")
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

// break up the text into words and add/remove keywords
//  for the dish
func updateDishKeywords(tc appengine.Context, key *datastore.Key,
	dish *Dish) {
	words := make(map[string]bool)
	addWords(dish.Name, words)
	addWords(dish.Source, words)
	updateKeywords(tc, key, words)
}
func updateIngredientKeywords(tc appengine.Context, key *datastore.Key,
	ing *Ingredient) {
	words := make(map[string]bool)
	addWords(ing.Name, words)
	addWords(ing.Category, words)
	updateKeywords(tc, key, words)
}

func addWords(text string, words map[string]bool) {
	spaced := strings.Map(func(rune int) int {
		if (unicode.IsPunct(rune)) {
			return ' '
		}
		return rune
	}, text)
	pieces := strings.Split(spaced, " ")
	for _, word := range pieces {
		if (len(word) > 1) {
			words[word] = false;
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

func ingredientHandler(c *context) {
	if strings.Contains(c.r.URL.Path, "/in/") {
		dishesForIngredientHandler(c)
		return
	}
	if strings.Contains(c.r.URL.Path, "/tags/") {
		wordHandler(c, "Tags")
		return
	}
	if strings.Contains(c.r.URL.Path, "/keywords/") {
		wordHandler(c, "Keyword")
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
	// check if the library is an ancestor of this key
	for key != nil {
		//fmt.Fprintf(self.w, "Check %v%v %v<br/>", key.Kind(),key.Encode(), self.l.Id.Encode())
		if (self.l.Id.Eq(key)) {
			return
		}
		key = key.Parent()
	}
	check(ErrUnknownItem)
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

type searchResult struct {
	Dishes      []*datastore.Key
	Ingredients []*datastore.Key
}


func searchHandler(c *context) {
	sp := searchParams{}
	readJSON(c.r, &sp)
	dishes := make(map[*datastore.Key] *datastore.Key)
	ings := make(map[*datastore.Key] *datastore.Key)
	firstPass := true

	// TODO parallelize
	for _, target :=range sp.Tags {
		nextDishes := make(map[*datastore.Key] *datastore.Key)
		nextIngs := make(map[*datastore.Key] *datastore.Key)
		query := c.NewQuery("Tags").Filter("Word=", target).KeysOnly()
		keys, err := query.GetAll(c.c, nil)
		check(err)
		for _, key := range keys {
			parent := key.Parent()
			if (parent.Kind() == "Dish") {
				if _, ok := dishes[parent]; firstPass || ok {
					nextDishes[parent] = parent
				}
			} else if (parent.Kind() == "Ingredient") {
				if _, ok := ings[parent]; firstPass || ok {
					nextIngs[parent] = parent
				}
			}
		}
		firstPass = false
		dishes = nextDishes
		ings = nextIngs
	}

	result := searchResult{}
	result.Ingredients = make([]*datastore.Key,0,len(ings))
	for _, ing:= range ings {
		result.Ingredients= append(result.Ingredients, ing)
		// carry results forward to list dishes that have the ingredients that matched
		query := c.NewQuery("MeasuredIngredient").Filter("Ingredient =", ing).KeysOnly()
		keys, err := query.GetAll(c.c, nil)
		check(err)
		for _, key := range keys {
			parent := key.Parent()
			dishes[parent] = parent
		}
	}
	result.Dishes = make([]*datastore.Key,0,len(dishes))
	for _, dish := range dishes {
		result.Dishes = append(result.Dishes, dish)
	}

	sendJSON(c.w, result)
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
	MeasuredIngredients map[string][]MeasuredIngredient
	Ingredients         []Ingredient
}

func backupHandler(c *context) {
	b := backup{}
	b.MeasuredIngredients = map[string][]MeasuredIngredient{}

	query := c.NewQuery("Dish")
	keys, err := query.GetAll(c.c, &b.Dishes)
	check(err)
	for index, _ := range b.Dishes {
		key := keys[index]
		b.Dishes[index].Id = key
		ingredients := make([]MeasuredIngredient, 0, 100)
		query = c.NewQuery("MeasuredIngredient").Order("Order")
		ikeys, err := query.GetAll(c.c, &ingredients)
		check(err)
		for iindex, _ := range ingredients {
			ingredients[iindex].Id = ikeys[iindex]
		}
		b.MeasuredIngredients[key.Encode()] = ingredients
	}
	query = c.NewQuery("Ingredient")
	keys, err = query.GetAll(c.c, &b.Ingredients)
	check(err)
	for index, _ := range b.Ingredients {
		key := keys[index]
		b.Ingredients[index].Id = key
	}
	sendJSONIndent(c.w, b)
}


func restoreHandler(c *context) {
	file, _, err := c.r.FormFile("restore-file")
	check(err)
	decoder := json.NewDecoder(file)
	data := backup{}
	err = decoder.Decode(&data)
	check(err)
	// TODO need to verify keys either don't exit or belong to this library
	// add all the ingredients
	for _, i := range data.Ingredients {
		key := i.Id
		check(err)
		_, err := datastore.Put(c.c, key, &i)
		check(err)
	}
	// add all the dishes
	for _, d := range data.Dishes {
		key := d.Id
		check(err)
		_, err := datastore.Put(c.c, key, &d)
		check(err)
	}
	// add all the dishes' ingredients
	for d, ingredients := range data.MeasuredIngredients {
		parent, err := datastore.DecodeKey(d)
		check(err)
		for _, i := range ingredients {
			ikey := i.Id
			if ikey.Parent() == nil {
				ikey = datastore.NewKey(c.c, "MeasuredIngredient", "", ikey.IntID(), parent)
			}
			_, err = datastore.Put(c.c, ikey, &i)
			check(err)
		}
	}
	indexHandler(c)
}
