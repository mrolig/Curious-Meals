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
			j, err := json.Marshal(dishes)
			check(err)
			w.Header().Set("Content-Type", "application/json")
			w.(io.Writer).Write(j)
		case "POST":
			newDish := Dish{}
			var bout bytes.Buffer
			io.Copy(&bout, r.Body)
			err := json.Unmarshal(bout.Bytes(), &newDish)
			if err != nil {
				fmt.Fprintf(w, "JSON %v", bout.String())
			}
			check(err)
			newDish.User = u.String()
			key := datastore.NewIncompleteKey("Dish")
			newDish.Id = key.String()
			_, err = datastore.Put(c, key, &newDish)
			check(err)
		}
		return
	}
	switch r.Method {
	case "GET":
		w.Header().Set("Content-Type", "application/json")
		fmt.Fprintf(w, id)
	case "PUT":
	case "DELETE":
	}
}

func getID(r *http.Request) string {
	parts := strings.Split(r.URL.Path, "/", -1)
	if len(parts) < 3 {
		return ""
	}
	return parts[len(parts)-1]
}
