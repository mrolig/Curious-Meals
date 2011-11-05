package mealplanner

import (
	"http"
	"fmt"
	"appengine"
	"appengine/user"
	"appengine/datastore"
	"appengine/mail"
	"appengine/memcache"
	"strings"
	"os"
	"io"
	"json"
	"unicode"
	"time"
)

func init() {
	http.HandleFunc("/", errorHandler(indexHandler))
	http.HandleFunc("/dish", cacheHandler(dishHandler))
	http.HandleFunc("/dish/", cacheHandler(dishHandler))
	http.HandleFunc("/users", permHandler(usersHandler))
	http.HandleFunc("/ingredient", cacheHandler(ingredientHandler))
	http.HandleFunc("/ingredient/", cacheHandler(ingredientHandler))
	http.HandleFunc("/menu/", cacheHandler(menuHandler))
	// search uses POST for a read, we don't use permHandler because
	// it would block searches of readonly libraries
	http.HandleFunc("/search", errorHandler(searchHandler))
	http.HandleFunc("/tags", cacheHandler(allTagsHandler))
	http.HandleFunc("/backup", permHandler(backupHandler))
	http.HandleFunc("/restore", permHandler(restoreHandler))
	http.HandleFunc("/share/", errorHandler(shareHandler))
	http.HandleFunc("/shareAccept/", errorHandler(shareAcceptHandler))
	http.HandleFunc("/libraries", errorHandler(librariesHandler))
	http.HandleFunc("/switch/", errorHandler(switchHandler))
	http.HandleFunc("/deletelib", errorHandler(deletelibHandler))
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
// cacheHandler wraps permHandler and errorHandler, it checks the 
//  cache for the response first
func cacheHandler(handler handlerFunc) http.HandlerFunc {
	return permHandler(func(c *context) {
		if c.r.Method == "GET" {
			item, err := memcache.Get(c.c, c.r.URL.Path)
			switch err {
			case nil:
				c.w.Write(item.Value)
				return
			case memcache.ErrCacheMiss:
				// we don't have the result cached, use the handler
				break
			default:
				check(err)
			}
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
	http.Redirect(c.w, c.r, "/index.html", http.StatusFound)
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
			handler.sendJSON(dishes)
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
	if updateKeywords(c, key, words) {
		// if we made changes, we need to clear the cache
		cacheKey := "/dish/" + key.Encode() + "/keywords/"
		memcache.Delete(c, cacheKey)
	}
}
func updateIngredientKeywords(c appengine.Context, key *datastore.Key,
ing *Ingredient) {
	words := make(map[string]bool)
	addWords(ing.Name, words)
	addWords(ing.Category, words)
	addTags(c, key, words)
	if updateKeywords(c, key, words) {
		// if we made changes, we need to clear the cache
		cacheKey := "/ingredient/" + key.Encode() + "/keywords/"
		memcache.Delete(c, cacheKey)
	}
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

// deletes or adds keyword entries as children of the key if they
//  are out of sync with the words map
// returns true if any entries were added or removed
func updateKeywords(c appengine.Context, key *datastore.Key, words map[string]bool) bool {
	query := datastore.NewQuery("Keyword").Ancestor(key)
	existingWords := make([]Word, 0, 25)
	keys, err := query.GetAll(c, &existingWords)
	check(err)
	changed := false
	for i, word := range existingWords {
		if _, ok := words[word.Word]; ok {
			words[word.Word] = true
		} else {
			// this keyword isn't here any more
			datastore.Delete(c, keys[i])
			changed = true
		}
	}
	for word, exists := range words {
		if !exists {
			newWord := Word{"", word}
			newKey := datastore.NewKey(c, "Keyword", "", 0, key)
			_, err := datastore.Put(c, newKey, &newWord)
			check(err)
			changed = true
		}
	}
	return changed
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
			handler.sendJSON(ingredients)
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
			handler.sendJSON(dishes)
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
			handler.sendJSON(words)
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
			handler.sendJSON(pairs)
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
			clearPairingCache(c, other, nil)
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
		datastore.DeleteMulti(handler.c, keys)
		clearPairingCache(c, otherParent, key)
	}
}

// clear the pairing cache for the specified dish/pair that is changed
func clearPairingCache(c *context, dishKey *datastore.Key, pairingKey *datastore.Key) {
	url := "/dish/" + dishKey.Encode() + "/pairing/"
	memcache.Delete(c.c, url)
	if pairingKey != nil {
		url += pairingKey.Encode()
		memcache.Delete(c.c, url)
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
			handler.sendJSON(ingredients)
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
			handler.sendJSON(menus)
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
				if err == nil {
					lid = upl
				} else  {
					// user can't get to this library, update thieir record
					//  so we dont fail all the time
					libs[0].UserPreferredLibrary = ""
					datastore.Put(c, keys[0], &libs[0])
				}
			}
		}
	}
	ctxt := &context{w, r, c, u, uid, l, lid, readOnly}
	if init {
		file, err := os.Open("mealplanner/base.json")
		if err != nil {
			file, err = os.Open("base.json")
		}
		if err == nil {
			importFile(ctxt, file)
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

func (self *context) sendJSON(object interface{}) {
	j, err := json.Marshal(object)
	check(err)
	self.w.Header().Set("Content-Type", "application/json")
	self.w.(io.Writer).Write(j)
	cacheKey := self.r.URL.Path
	switch self.r.Method {
		case "POST":
			// posting is adding a new item, the URL is the "collection"
			//  URL, and the new item is being returned
			// thus we should delete the now dirty collection from the cache
			//  and add the new item to the cache
			memcache.Delete(self.c, cacheKey)
			if cacheKey[len(cacheKey)-1] != '/' {
				memcache.Delete(self.c, cacheKey + "/")
			} else {
				memcache.Delete(self.c, cacheKey[:len(cacheKey)-1])
			}
			if ider, ok := object.(Ided); ok {
				if cacheKey[len(cacheKey)-1] != '/' {
					cacheKey += "/"
				}
				cacheKey += ider.ID()
				memcache.Set(self.c, &memcache.Item{Key:cacheKey,Value:j})
			}
		case "PUT":
			// PUT is updating an item, we should update the cache
			//  with this item, and clear the parent collection
			memcache.Set(self.c, &memcache.Item{Key:cacheKey,Value:j})
			id := getID(self.r)
			parentKey := cacheKey[:len(cacheKey)-len(id)]
			memcache.Delete(self.c, parentKey)
			memcache.Delete(self.c, parentKey[:len(parentKey)-1])
		case "GET":
			//  GETs are getting the item, we should add to the cache
			memcache.Set(self.c, &memcache.Item{Key:cacheKey,Value:j})
		case "DELETE":
			// we shouldn't get here, deletes don't send back JSON
	}
}

func (self *context) sendJSONIndent(object interface{}) {
	j, err := json.MarshalIndent(object, "", "\t")
	check(err)
	self.w.Header().Set("Content-Type", "application/json")
	self.w.(io.Writer).Write(j)
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
	self.sendJSON(newObject)
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
	self.sendJSON(object)
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
	self.sendJSON(object)
}

func (self *dataHandler) delete(key *datastore.Key) {
	err := datastore.Delete(self.c, key)
	check(err)
	// remove this item from the cache
	memcache.Delete(self.c, self.r.URL.Path)
   // remove the parent from the cache too
	// strip off the key from the URL
	parentURL := self.r.URL.Path[:len(self.r.URL.Path) - len(key.Encode())]
	memcache.Delete(self.c, parentURL)
	// also without the /
	memcache.Delete(self.c, parentURL[:len(parentURL)-1])
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
	c.sendJSON(results)
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
	c.sendJSON(tags)
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
	c.sendJSONIndent(b)
}

func restoreHandler(c *context) {
	file, _, err := c.r.FormFile("restore-file")
	check(err)
	importFile(c, file)
	indexHandler(c)
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
	subject := c.u.Email + " would like to share a meal-planning library with you"
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
	query = datastore.NewQuery("Perm").Filter("UserId=", uid)
	iter := query.Run(c.c)
	perm := Perm{}
	for key, err := iter.Next(&perm);
		err == nil;
		key, err = iter.Next(&perm) {
		lib := Library{}
		libkey := key.Parent()
		err = datastore.Get(c.c, libkey, &lib)
		if err != nil {
			continue
		}
		ul := UserLibrary{libkey, lib.Name, perm.ReadOnly,
			libkey.Eq(c.lid), false}
		if len(ul.Name) == 0 {
			ul.Name = lib.OwnerId
		}
		libraries = append(libraries, ul)
	}
	c.sendJSON(libraries)
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

func deletelibHandler(c *context) {
	uid := c.getUid()
	query := datastore.NewQuery("Library").Filter("OwnerId =", uid).Limit(1)
	libs := make([]Library, 0, 1)
	keys, err := query.GetAll(c.c, &libs)
	check(err)
	if len(libs) == 0 {
		return
	}
	err = datastore.Delete(c.c, keys[0])
	check(err)
}
