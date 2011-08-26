package mealplanner

import (
	"http"
	"fmt"
	"appengine"
	"appengine/user"
)

func init() {
	http.HandleFunc("/", indexHandler)
	http.HandleFunc("/dish", dishHandler)
	http.HandleFunc("/users", usersHandler)
}

func indexHandler(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Location", "/index.html")
	w.WriteHeader(http.StatusFound)
}
func usersHandler(w http.ResponseWriter, r *http.Request) {
	c := appengine.NewContext(r)
	u := user.Current(c)
	logoutURL, _ := user.LogoutURL(c, "/index.html")
	fmt.Fprintf(w, `[{ "name" : "%v", "logoutURL" : "%v"}]`,
		u, logoutURL)
}
func dishHandler(w http.ResponseWriter, r *http.Request) {
	c := appengine.NewContext(r)
	u := user.Current(c)
	fmt.Fprintf(w, "Edit, %v!", u)
}
