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
	"bytes"
)

func init() {
	http.HandleFunc("/", errorHandler(indexHandler))
	http.HandleFunc("/dish", errorHandler(dishHandler))
	http.HandleFunc("/dish/", errorHandler(dishHandler))
	http.HandleFunc("/users", errorHandler(usersHandler))
	http.HandleFunc("/ingredient/", errorHandler(ingredientHandler))
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
	handler := newDataHandler(w, r, "Dish")
	id := getID(r)
	if len(id) == 0 {
		switch r.Method {
		case "GET":
			query := datastore.NewQuery("Dish").Filter("User =", handler.u.String()).Order("Name")
			dishes := make([]Dish, 0, 100)
			keys, err := query.GetAll(handler.c, &dishes)
			check(err)
			for index, d := range dishes {
				d.Id = keys[index].Encode()
			}
			sendJSON(handler.w, dishes)
		case "POST":
			dish := Dish{}
			handler.createEntry(&dish)
		}
		return
	}
	key, err := datastore.DecodeKey(id)
	check(err)
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

func ingredientHandler(w http.ResponseWriter, r *http.Request) {
	handler := newDataHandler(w, r, "Ingredient")
	id := getID(r)
	if len(id) == 0 {
		switch r.Method {
		case "GET":
			query := datastore.NewQuery("Ingredient").Filter("User =", handler.u.String()).Order("Name")
			ingredients := make([]Ingredient, 0, 100)
			keys, err := query.GetAll(handler.c, &ingredients)
			check(err)
			for index, i := range ingredients {
				i.Id = keys[index].Encode()
			}
			sendJSON(handler.w, ingredients)
		case "POST":
			ingredient := Ingredient{}
			handler.createEntry(&ingredient)
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

func readJSON(r *http.Request, object interface{}) {
	var bout bytes.Buffer
	io.Copy(&bout, r.Body)
	err := json.Unmarshal(bout.Bytes(), object)
	check(err)
}

func getID(r *http.Request) string {
	parts := strings.Split(r.URL.Path, "/", -1)
	if len(parts) < 3 {
		return ""
	}
	return parts[len(parts)-1]
}
var (
	ErrUnknownDish = os.NewError("Unknown dish")
)
type Owned interface {
	Owner() string
	SetOwner(string)
	ID() string
	SetID(string)
}

type dataHandler struct {
	w http.ResponseWriter
	r *http.Request
	kind string
	c appengine.Context
	u *user.User
}

func newDataHandler( w http.ResponseWriter, r *http.Request, kind string) *dataHandler {
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
		check(ErrUnknownDish);
	}
}

func (self *dataHandler) createEntry(newObject interface{}) {
	r := self.r
	c := self.c
	owned, ok := newObject.(Owned)
	if !ok {
		check(datastore.ErrInvalidEntityType)
	}
	readJSON(r, newObject)
	owned.SetOwner( self.u.String())
	key := datastore.NewIncompleteKey(self.kind)
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
