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
		tagsHandler(c, "Dish")
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
			handler.createEntry(&dish, nil)
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
	case "DELETE":
		handler.delete(key)
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
			dishes := make([]string, 0, 100)
			keys, err := query.GetAll(handler.c, nil)
			check(err)
			for _, key := range keys {
				dishes = append(dishes, key.Parent().Encode())
			}
			sendJSON(handler.w, dishes)
		}
		return
	}
}

func tagsHandler(c *context, parentKind string) {
	handler := newDataHandler(c, "Tags")
	id := getID(c.r)
	parentKey,err := datastore.DecodeKey(getParentID(c.r))
	check(err)
	c.checkUser(parentKey)
	if len(id) == 0 {
		switch c.r.Method {
		case "GET":
			query := c.NewQuery("Tags").Ancestor(parentKey)
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
		tagsHandler(c, "Ingredient")
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
			handler.createEntry(&ingredient, nil)
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
		l = &Library{nil, uid}
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

func (self *dataHandler) createEntry(newObject interface{}, parent *datastore.Key) {
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
	Name   string
}

type searchResult struct {
	Dishes      []*datastore.Key
	Ingredients []*datastore.Key
}


func searchHandler(c *context) {
	result := searchResult{}
	sp := searchParams{}
	readJSON(c.r, &sp)

	// TODO redo Tags
	/*
	query := c.NewQuery("Dish").Order("Name")
	dishes := make([]Dish, 0, 100)
	keys, err := query.GetAll(c.c, &dishes)
	check(err)
	for index, dish := range dishes {
		match := true
		for _, target := range sp.Tags {
			found := false
		Inner:
			for _, tag := range dish.Tags {
				if target == tag {
					found = true
					break Inner
				}
			}
			if !found {
				match = false
				break
			}
		}
		if match {
			result.Dishes = append(result.Dishes, keys[index])
		}
	}*/
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
