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
	c := appengine.NewContext(r)
	u := user.Current(c)
	id := getID(r)
	if len(id) == 0 {
		switch r.Method {
		case "GET":
			query := datastore.NewQuery("Dish").Filter("User =", u.String()).Order("Name")
			dishes := make([]Dish, 0, 100)
			_, err := query.GetAll(c, &dishes)
			check(err)
			sendJSON(w, dishes)
		case "POST":
			newDish := Dish{}
			readJSON(r, &newDish)
			newDish.User = u.String()
			key := datastore.NewIncompleteKey("Dish")
			key, err := datastore.Put(c, key, &newDish)
			check(err)
			newDish.Id = key.Encode()
			_, err = datastore.Put(c, key, &newDish)
			check(err)
			sendJSON(w, newDish)
		}
		return
	}
	key, err := datastore.DecodeKey(id)
	check(err)
	checkDishUser(c, u, key)
	switch r.Method {
	case "GET":
		w.Header().Set("Content-Type", "application/json")
		dish := Dish{}
		err = datastore.Get(c, key, &dish)
		check(err)
		sendJSON(w, dish)
	case "PUT":
		dish := Dish{}
		readJSON(r, &dish)
		dish.User = u.String()
		_, err = datastore.Put(c, key, &dish)
		check(err)
		sendJSON(w, dish)
	case "DELETE":
		err = datastore.Delete(c, key)
		check(err)
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
func checkDishUser(c appengine.Context, u *user.User, key *datastore.Key) {
	dish := Dish{}
	err := datastore.Get(c, key, &dish)
	check(err)
	if dish.User != u.String() {
		check(ErrUnknownDish);
	}
}
