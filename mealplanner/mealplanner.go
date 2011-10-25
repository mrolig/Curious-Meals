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
	http.HandleFunc("/tags", errorHandler(tagsHandler))
	http.HandleFunc("/backup", errorHandler(backupHandler))
	http.HandleFunc("/restore", errorHandler(restoreHandler))
}

// errorHandler catches errors and prints an HTTP 500 error 
func errorHandler(handler http.HandlerFunc) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		defer func() {
			if err, ok := recover().(os.Error); ok {
				w.WriteHeader(http.StatusInternalServerError)
				fmt.Fprintf(w, "%v", err)
			}
		}()
		handler(w, r)
	}
}
func check(err os.Error) {
	if err != nil {
		panic(err)
	}
}
func indexHandler(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Location", "/index.html")
	w.WriteHeader(http.StatusFound)
}
func usersHandler(w http.ResponseWriter, r *http.Request) {
	c := appengine.NewContext(r)
	u := user.Current(c)
	logoutURL, _ := user.LogoutURL(c, "/index.html")
	fmt.Fprintf(w, `[{ "Name" : "%v", "logoutURL" : "%v"}]`,
		u, logoutURL)
}
func dishHandler(w http.ResponseWriter, r *http.Request) {
	if strings.Contains(r.URL.Path, "/mi/") {
		measuredIngredientsHandler(w, r)
		return
	}
	handler := newDataHandler(w, r, "Dish")
	id := getID(r)
	if len(id) == 0 {
		switch r.Method {
		case "GET":
			query := datastore.NewQuery("Dish").Filter("User =", handler.u.String()).Order("Name")
			dishes := make([]Dish, 0, 100)
			keys, err := query.GetAll(handler.c, &dishes)
			check(err)
			for index, _ := range dishes {
				dishes[index].Id = keys[index].Encode()
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
	dish := Dish{}
	handler.checkUser(key, &dish)
	switch r.Method {
	case "GET":
		handler.get(id, &dish)
	case "PUT":
		handler.update(key, id, &dish)
	case "DELETE":
		handler.delete(key)
	}
}

func measuredIngredientsHandler(w http.ResponseWriter, r *http.Request) {
	handler := newDataHandler(w, r, "MeasuredIngredient")
	id := getID(r)
	parent, err := datastore.DecodeKey(getParentID(r))
	check(err)
	if len(id) == 0 {
		switch r.Method {
		case "GET":
			query := datastore.NewQuery(handler.kind).Ancestor(parent).Order("Order")
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
	mi := MeasuredIngredient{}
	handler.checkUser(key, &mi)
	switch r.Method {
	case "GET":
		handler.get(id, &mi)
	case "PUT":
		handler.update(key, id, &mi)
	case "DELETE":
		handler.delete(key)
	}
}

func dishesForIngredientHandler(w http.ResponseWriter, r *http.Request) {
	handler := newDataHandler(w, r, "Dish")
	id := getID(r)
	ingKey,err := datastore.DecodeKey(getParentID(r))
	check(err)
	if len(id) == 0 {
		switch r.Method {
		case "GET":
			query := datastore.NewQuery("MeasuredIngredient").Filter("User =", handler.u.String()).Filter("Ingredient =", ingKey).KeysOnly()
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

func ingredientHandler(w http.ResponseWriter, r *http.Request) {
	if strings.Contains(r.URL.Path, "/in/") {
		dishesForIngredientHandler(w, r)
		return
	}
	handler := newDataHandler(w, r, "Ingredient")
	id := getID(r)
	if len(id) == 0 {
		switch r.Method {
		case "GET":
			query := datastore.NewQuery("Ingredient").Filter("User =", handler.u.String()).Order("Name")
			ingredients := make([]Ingredient, 0, 100)
			keys, err := query.GetAll(handler.c, &ingredients)
			check(err)
			for index, _ := range ingredients {
				ingredients[index].Id = keys[index].Encode()
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
	ingredient := Ingredient{}
	handler.checkUser(key, &ingredient)
	switch r.Method {
	case "GET":
		handler.get(id, &ingredient)
	case "PUT":
		handler.update(key, id, &ingredient)
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

type Owned interface {
	Owner() string
	SetOwner(string)
	ID() string
	SetID(string)
}

type dataHandler struct {
	w    http.ResponseWriter
	r    *http.Request
	kind string
	c    appengine.Context
	u    *user.User
}

func newDataHandler(w http.ResponseWriter, r *http.Request, kind string) *dataHandler {
	c := appengine.NewContext(r)
	u := user.Current(c)
	return &dataHandler{w, r, kind, c, u}
}

func (self *dataHandler) checkUser(key *datastore.Key, object interface{}) {
	owned, ok := object.(Owned)
	if !ok {
		check(os.NewError(fmt.Sprint(object) + fmt.Sprint(ok)))
		check(datastore.ErrInvalidEntityType)
	}
	err := datastore.Get(self.c, key, object)
	check(err)
	if owned.Owner() != self.u.String() {
		check(ErrUnknownItem)
	}
}

func (self *dataHandler) createEntry(newObject interface{}, parent *datastore.Key) {
	r := self.r
	c := self.c
	owned, ok := newObject.(Owned)
	if !ok {
		check(datastore.ErrInvalidEntityType)
	}
	readJSON(r, newObject)
	owned.SetOwner(self.u.String())
	key := datastore.NewKey(c, self.kind, "", 0, parent)
	key, err := datastore.Put(c, key, newObject)
	check(err)
	owned.SetID(key.Encode())
	sendJSON(self.w, newObject)
}
func (self *dataHandler) get(id string, object interface{}) {
	self.w.Header().Set("Content-Type", "application/json")
	owned, ok := object.(Owned)
	if !ok {
		check(datastore.ErrInvalidEntityType)
	}
	owned.SetID(id)
	sendJSON(self.w, object)
}
func (self *dataHandler) update(key *datastore.Key, id string, object interface{}) {
	readJSON(self.r, object)
	// don't let user change the USER or ID
	owned, ok := object.(Owned)
	if !ok {
		check(datastore.ErrInvalidEntityType)
	}
	owned.SetID(id)
	owned.SetOwner(self.u.String())
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
	Dishes      []Dish
	Ingredients []Ingredient
}


func searchHandler(w http.ResponseWriter, r *http.Request) {
	c := appengine.NewContext(r)
	u := user.Current(c)
	result := searchResult{}
	sp := searchParams{}
	readJSON(r, &sp)

	query := datastore.NewQuery("Dish").Filter("User =", u.String()).Order("Name")
	dishes := make([]Dish, 0, 100)
	keys, err := query.GetAll(c, &dishes)
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
			dish.Id = keys[index].Encode()
			result.Dishes = append(result.Dishes, dish)
		}
	}
	sendJSON(w, result)
}

func tagsHandler(w http.ResponseWriter, r *http.Request) {
	c := appengine.NewContext(r)
	u := user.Current(c)
	tags := make(map[string]string)
	query := datastore.NewQuery("Dish").Filter("User =", u.String())
	dishes := make([]Dish, 0, 100)
	_, err := query.GetAll(c, &dishes)
	check(err)
	for _, dish := range dishes {
		for _, tag := range dish.Tags {
			tags[tag] = tag
		}
	}
	query = datastore.NewQuery("Ingredient").Filter("User =", u.String())
	ingredients := make([]Ingredient, 0, 100)
	_, err = query.GetAll(c, &ingredients)
	check(err)
	for _, ingredient := range ingredients {
		for _, tag := range ingredient.Tags {
			tags[tag] = tag
		}
	}
	sendJSON(w, tags)
}

type backup struct {
	Dishes              []Dish
	MeasuredIngredients map[string][]MeasuredIngredient
	Ingredients         []Ingredient
}

func backupHandler(w http.ResponseWriter, r *http.Request) {
	c := appengine.NewContext(r)
	u := user.Current(c)
	b := backup{}
	b.MeasuredIngredients = map[string][]MeasuredIngredient{}

	query := datastore.NewQuery("Dish").Filter("User =", u.String())
	keys, err := query.GetAll(c, &b.Dishes)
	check(err)
	for index, _ := range b.Dishes {
		key := keys[index].Encode()
		b.Dishes[index].Id = key
		ingredients := make([]MeasuredIngredient, 0, 100)
		query = datastore.NewQuery("MeasuredIngredient").Ancestor(keys[index]).Order("Order")
		ikeys, err := query.GetAll(c, &ingredients)
		check(err)
		for iindex, _ := range ingredients {
			ingredients[iindex].Id = ikeys[iindex].Encode()
		}
		b.MeasuredIngredients[key] = ingredients
	}
	query = datastore.NewQuery("Ingredient").Filter("User =", u.String())
	keys, err = query.GetAll(c, &b.Ingredients)
	check(err)
	for index, _ := range b.Ingredients {
		key := keys[index].Encode()
		b.Ingredients[index].Id = key
	}
	sendJSONIndent(w, b)
}


func restoreHandler(w http.ResponseWriter, r *http.Request) {
	c := appengine.NewContext(r)
	u := user.Current(c)
	owner := u.String()
	file, _, err := r.FormFile("restore-file")
	check(err)
	decoder := json.NewDecoder(file)
	data := backup{}
	err = decoder.Decode(&data)
	check(err)
	// add all the ingredients
	for _, i := range data.Ingredients {
		key, err := datastore.DecodeKey(i.Id)
		check(err)
		i.SetOwner(owner)
		_, err = datastore.Put(c, key, &i)
		check(err)
	}
	// add all the dishes
	for _, d := range data.Dishes {
		key, err := datastore.DecodeKey(d.Id)
		check(err)
		d.SetOwner(owner)
		_, err = datastore.Put(c, key, &d)
		check(err)
	}
	// add all the dishes' ingredients
	for d, ingredients := range data.MeasuredIngredients {
		parent, err := datastore.DecodeKey(d)
		check(err)
		for _, i := range ingredients {
			ikey, err := datastore.DecodeKey(i.Id)
			check(err)
			if ikey.Parent() == nil {
				ikey = datastore.NewKey(c, "MeasuredIngredient", "", ikey.IntID(), parent)
			}
			i.SetOwner(owner)
			_, err = datastore.Put(c, ikey, &i)
			check(err)
		}
	}
	indexHandler(w, r)
}
