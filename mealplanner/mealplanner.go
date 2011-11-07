package mealplanner
// main HTTP server handlers for the meal planner backend

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

// Error constants
var (
	ErrUnknownItem = os.NewError("Unknown item")
	ErrUnsupported = os.NewError("Unsupported action")
)

// setup the handler functions
func init() {
	http.HandleFunc("/", errorHandler(indexHandler))
	http.HandleFunc("/dish", cacheHandler(dishHandler))
	http.HandleFunc("/dish/", cacheHandler(dishHandler))
	http.HandleFunc("/users", permHandler(usersHandler))
	http.HandleFunc("/ingredient", cacheHandler(ingredientHandler))
	http.HandleFunc("/ingredient/", cacheHandler(ingredientHandler))
	http.HandleFunc("/menu/", cacheHandler(menuHandler))
	http.HandleFunc("/tags", permHandler(allTagsHandler))
	http.HandleFunc("/backup", permHandler(backupHandler))
	http.HandleFunc("/restore", permHandler(restoreHandler))
	http.HandleFunc("/share/", errorHandler(shareHandler))
	http.HandleFunc("/shareAccept/", errorHandler(shareAcceptHandler))
	http.HandleFunc("/libraries", errorHandler(librariesHandler))
	http.HandleFunc("/switch/", errorHandler(switchHandler))
	http.HandleFunc("/deletelib", errorHandler(deletelibHandler))
	// search uses POST for a read, we don't use permHandler because
	// it would block searches of readonly libraries
	http.HandleFunc("/search", errorHandler(searchHandler))
}

// context structure to carry common data we need for most of our handlers
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
// type to let us build general functionality for a handler
//  using a common context
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
			item, err := memcache.Get(c.c, c.lid.Encode()+c.r.URL.Path)
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
// panics if err != nill
func check(err os.Error) {
	if err != nil {
		panic(err)
	}
}
// redirect "/" to "index.html"
func indexHandler(c *context) {
	http.Redirect(c.w, c.r, "/index.html", http.StatusFound)
}

// returns JSON information about the user [{Name: "", logoutURL:""}, ...]
func usersHandler(c *context) {
	logoutURL, _ := user.LogoutURL(c.c, "/index.html")
	fmt.Fprintf(c.w, `[{ "Name" : "%v", "logoutURL" : "%v"}]`,
		c.u, logoutURL)
}
// returns JSON with dish or dishes
func dishHandler(c *context) {
	// handle measured ingredients
	if strings.Contains(c.r.URL.Path, "/mi/") {
		measuredIngredientsHandler(c)
		return
	}
	// handle tags
	if strings.Contains(c.r.URL.Path, "/tags/") {
		wordHandler(c, "Tags")
		// update keywords if tags have changed
		if c.r.Method != "GET" {
			updateDishKeywordsKeyStr(c, getParentID(c.r))
		}
		return
	}
	// for debugging, get keywords
	if strings.Contains(c.r.URL.Path, "/keywords/") {
		wordHandler(c, "Keyword")
		return
	}
	// handle pairings
	if strings.Contains(c.r.URL.Path, "/pairing/") {
		pairingHandler(c)
		return
	}
   // use the standard data handler, add post-processing via callback
   //  so we can update keywords and remove references to this dish
   //  when items are written and deleted
	handler := newDataHandler(c, "Dish", func() Ided { return &Dish{} }, "Name")
   handler.handleRequest(c.lid,
      func(method string, key *datastore.Key, item Ided) {
      switch method {
         case "POST", "PUT":
            // update keyword index after a change
            updateDishKeywords(c, key, item.(*Dish))
         case "DELETE":
		      // removing any pairings that reference this dish
		      query := c.NewQuery("Pairing").Filter("Other=", key).KeysOnly()
		      keys, err := query.GetAll(c.c, nil)
		      check(err)
		      datastore.DeleteMulti(c.c, keys)
		      for _, pk := range keys {
			      memcache.Delete(c.c, "/dish/"+pk.Parent().Encode()+"/pairing/")
		      }
		      // fix any menus referencing this dish
		      query = c.NewQuery("Menu")
				iter := query.Run(c.c)
				menu := &Menu{}
		      for mkey, err := iter.Next(menu); err != datastore.Done; mkey, err = iter.Next(menu) {
               check(err)
			      newDishes := make([]*datastore.Key, 0, len(menu.Dishes))
			      for _, dkey := range menu.Dishes {
				      if !key.Eq(dkey) {
					      newDishes = append(newDishes, dkey)
				      }
			      }
			      if len(newDishes) < len(menu.Dishes) {
				      menu.Dishes = newDishes
				      _, err = datastore.Put(c.c, mkey, menu)
                  check(err)
                  // flush the cache for menus 
				      memcache.Delete(c.c, c.lid.Encode() + "/menu/"+mkey.Encode())
				      memcache.Delete(c.c, c.lid.Encode() + "/menu/")
				      memcache.Delete(c.c, c.lid.Encode() + "/menu")
			      }
					menu = &Menu{}
		      }
         }
      })
}

// query data store for tags applied to the element with key given,
//  add them to the map passed in
func addTags(c appengine.Context, key *datastore.Key, words map[string]bool) {
	query := datastore.NewQuery("Tags").Ancestor(key)
	iter := query.Run(c)
	tag := &Word{}
	for _, err := iter.Next(tag); err == nil; _, err = iter.Next(tag) {
		addWords(tag.Word, words)
	}
}

// break up the text into words and add/remove keywords  for the dish
func updateDishKeywords(c *context, key *datastore.Key, dish *Dish) {
	words := make(map[string]bool)
	addWords(dish.Name, words)
	addWords(dish.Source, words)
	addWords(dish.Text, words)
	addTags(c.c, key, words)
	if updateKeywords(c.c, key, words) {
		// if we made changes, we need to clear the cache
		cacheKey := c.lid.Encode() + "/dish/" + key.Encode() + "/keywords/"
		memcache.Delete(c.c, cacheKey)
	}
}
// update the keywords for the dish, starting with the encoded key for the dish
func updateDishKeywordsKeyStr(c *context, keyStr string) {
	key, err := datastore.DecodeKey(keyStr)
	check(err)
	dish := Dish{}
	err = datastore.Get(c.c, key, &dish)
	check(err)
	updateDishKeywords(c, key, &dish)
}
// update the ingredient's keywords
func updateIngredientKeywords(c *context, key *datastore.Key,
ing *Ingredient) {
	words := make(map[string]bool)
	addWords(ing.Name, words)
	addWords(ing.Category, words)
	addTags(c.c, key, words)
	if updateKeywords(c.c, key, words) {
		// if we made changes, we need to clear the cache
		cacheKey := c.lid.Encode() + "/ingredient/" + key.Encode() + "/keywords/"
		memcache.Delete(c.c, cacheKey)
	}
}

// break apart the text into words, add each word to the given map
//  also, add singluars by stripping "s" and "es"
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
	iter := query.Run(c)
	changed := false
	word := &Word{}
	for key, err := iter.Next(word); err == nil; _, err = iter.Next(word) {
		if _, ok := words[word.Word]; ok {
			words[word.Word] = true
		} else {
			// this keyword isn't here any more
			datastore.Delete(c, key)
			changed = true
		}
	}
	for word, exists := range words {
		if !exists {
			newWord := Word{"", word}
			newKey := datastore.NewIncompleteKey(c, "Keyword", key)
			_, err := datastore.Put(c, newKey, &newWord)
			check(err)
			changed = true
		}
	}
	return changed
}

// handler for requests to get the measured ingredients of a dish (parent)
func measuredIngredientsHandler(c *context) {
   // get the dish's id and verify it
	parent, err := datastore.DecodeKey(getParentID(c.r))
	check(err)
	c.checkUser(parent)
   // use the default data handler
	handler := newDataHandler(c, "MeasuredIngredient", func() Ided { return &MeasuredIngredient{} }, "Order")
   handler.handleRequest(parent, nil)
}

// handler to get list of dishes that include the given ingredient
func dishesForIngredientHandler(c *context) {
   // check that the ingredient is valid
	ingKey, err := datastore.DecodeKey(getParentID(c.r))
	check(err)
	c.checkUser(ingKey)
   // setup handler class
	handler := newDataHandler(c, "Dish", func() Ided { return &Dish{} }, "")
	if c.r.Method == "GET" {
      // get all measured ingredients that reference this ingredient
		query := c.NewQuery("MeasuredIngredient").Filter("Ingredient =", ingKey).KeysOnly()
		dishes := make([]string, 0, 100)
      iter := query.Run(c.c)
      // take each match, and add its parent (dish)
      for key, err := iter.Next(nil); err != datastore.Done; key, err = iter.Next(nil) {
         check(err)
			dishes = append(dishes, key.Parent().Encode())
      }
		handler.sendJSON(dishes)
	} else {
      check(ErrUnsupported)
   }
}

// handler to access tags and keyword children of an item (parent)
func wordHandler(c *context, kind string) {
   // validate the parent Key
	parentKey, err := datastore.DecodeKey(getParentID(c.r))
	check(err)
	c.checkUser(parentKey)
   // use the default handler
	handler := newDataHandler(c, kind, func() Ided { return &Word{} }, "")
   handler.handleRequest(parentKey, nil)
}

// handler to access pairings as children of a dish (parent)
func pairingHandler(c *context) {
   // validate the dish key
	parentKey, err := datastore.DecodeKey(getParentID(c.r))
	check(err)
	c.checkUser(parentKey)
	kind := "Pairing"
	handler := newDataHandler(c, kind, func() Ided { return &Pairing{} }, "")
   // we don't use the standard handlers for PUT and DELETE
   switch c.r.Method {
      case "PUT":
		   // can't modify a pairing, only add/remove
		   check(ErrUnsupported)
      case "DELETE":
         // validate the id
	      id := getID(c.r)
	      key, err := datastore.DecodeKey(id)
	      check(err)
	      handler.checkUser(key)
         // find the symetrical pairing so we can remove it too
         pairing := Pairing{}
		   err = datastore.Get(c.c, key, &pairing)
		   check(err)
		   otherParent := pairing.Other
		   query := datastore.NewQuery(kind).Ancestor(otherParent).Filter("Other=", parentKey).Filter("Description=", pairing.Description).KeysOnly()
		   keys, err := query.GetAll(c.c, nil)
		   check(err)
         // delete the entry given
		   handler.delete(key)
         // delete the symetrical pairing(s)
		   datastore.DeleteMulti(handler.c, keys)
         // flush the cache
		   clearPairingCache(c, otherParent, key)
      default:
         // use the default handler for "GET" and "POST"
         handler.handleRequest(parentKey,
            func(method string, key *datastore.Key, item Ided) {
            switch method {
		      case "POST":
               // after a "POST" to create a new item,
               //  add the symetrical entry for the other dish
               pairing := item.(*Pairing)
			      // create the matching entry
			      other := pairing.Other
			      newPairKey := datastore.NewIncompleteKey(c.c, kind, other)
			      pairing.Other = parentKey
			      pairing.Id = ""
			      newPairKey, err := datastore.Put(c.c, newPairKey, pairing)
			      check(err)
			      clearPairingCache(c, other, nil)
            }
         })
   }
}

// clear the pairing cache for the specified dish/pair that is changed
func clearPairingCache(c *context, dishKey *datastore.Key, pairingKey *datastore.Key) {
	url := c.lid.Encode() + "/dish/" + dishKey.Encode() + "/pairing/"
	memcache.Delete(c.c, url)
	if pairingKey != nil {
		url += pairingKey.Encode()
		memcache.Delete(c.c, url)
	}
}

// handler for ingredients
func ingredientHandler(c *context) {
   // handle requests for dishes using the ingredient 
	if strings.Contains(c.r.URL.Path, "/in/") {
		dishesForIngredientHandler(c)
		return
	}
   // handler for tags
	if strings.Contains(c.r.URL.Path, "/tags/") {
		wordHandler(c, "Tags")
      // update keywords if tags were changed
		if c.r.Method != "GET" {
			key, err := datastore.DecodeKey(getParentID(c.r))
			check(err)
			ingredient := Ingredient{}
			err = datastore.Get(c.c, key, &ingredient)
			check(err)
			updateIngredientKeywords(c, key, &ingredient)
		}
		return
	}
   // handler for debugging keywords
	if strings.Contains(c.r.URL.Path, "/keywords/") {
		wordHandler(c, "Keyword")
		return
	}
   // use default data handler with callback when done
	handler := newDataHandler(c, "Ingredient", func() Ided { return &Ingredient{} }, "Name")
   handler.handleRequest(c.lid,
      func(method string, key *datastore.Key, item Ided) {
      switch method {
         case "POST", "PUT":
            // update keywords after adding/changing an item
			   updateIngredientKeywords(c, key, item.(*Ingredient))
      }
   })
}

// handler for menu requests
func menuHandler(c *context) {
   // handle tags 
	if strings.Contains(c.r.URL.Path, "/tags/") {
		wordHandler(c, "Tags")
		return
	}
   // use default data handler
	handler := newDataHandler(c, "Menu", func() Ided { return &Menu{} }, "Name")
   handler.handleRequest(c.lid, nil)
}

// helper function for decoding json checking for errors
func readJSON(r *http.Request, object interface{}) {
	err := json.NewDecoder(r.Body).Decode(object)
	check(err)
}

// helper to fetch the ID part of the URL (anything after the last '/')
func getID(r *http.Request) string {
	parts := strings.Split(r.URL.Path, "/")
	if len(parts) < 3 {
		return ""
	}
	return parts[len(parts)-1]
}

// helper to fetch the parent's ID when multiple IDs appear in the path
// returns 3rd to last path part, e.g. /dish/<pid>/tags/<tid>
// will return "<pid>"
func getParentID(r *http.Request) string {
	parts := strings.Split(r.URL.Path, "/")
	if len(parts) < 5 {
		return ""
	}
	return parts[len(parts)-3]
}

// create a new context to wrap data
//  creates a new library if user has none
//  sets the context if user wants to view a library othe than their own
//  caches library in memcache
func newContext(w http.ResponseWriter, r *http.Request) *context {
	c := appengine.NewContext(r)
	u := user.Current(c)
	uid := u.Id
	if len(uid) == 0 {
		uid = u.Email
	}
	lid, l, init := getOwnLibrary(c, u)
   // check if the user wants to use a different library
	upl, err := datastore.DecodeKey(l.UserPreferredLibrary)
	if err != nil {
		//fmt.Fprintf(w, "No UPL %v", l.UserPreferredLibrary)
		upl = nil
	}
	readOnly := false
	// use an alternate library if the user wants to
	if upl != nil && !lid.Eq(upl) {
      // check for permision
		perm := getLibPerm(c, uid, upl)
		//fmt.Fprintf(w, "Try UPL %v, %v\n", l.UserPreferredLibrary, perm)
		var otherlib *Library = nil
		if perm != nil {
			otherlib = &Library{}
			_, err = memcache.Gob.Get(c, upl.Encode(), otherlib)
			//fmt.Fprintf(w, "cache %v %v\n", err, otherlib)
			if err != nil {
				err = datastore.Get(c, upl, otherlib)
				//fmt.Fprintf(w, "ds %v %v\n", err, otherlib)
			}
			if err == nil {
				lid = upl
				l = otherlib
				// save the library back to the cache
				memcache.Gob.Set(c, &memcache.Item{Key: upl.Encode(), Object: otherlib})
			}
		}
		if l != otherlib {
			// user can't get to this library, update thieir record
			//  so we dont fail all the time
			l.UserPreferredLibrary = ""
			datastore.Put(c, lid, l)
			memcache.Gob.Set(c, &memcache.Item{Key: lid.Encode(), Object: l})
		} else {
			readOnly = perm.ReadOnly
		}
	}
   // create the context with all of the data we gathered
	ctxt := &context{w, r, c, u, uid, l, lid, readOnly}
   // if this is a new library, populate it with data
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

// get the user's id
func (self *context) getUid() string {
	uid := self.u.Id
	if len(uid) == 0 {
		uid = self.u.Email
	}
	return uid
}

// check if the key given is accessible in the current library
//  panic if not
func (self *context) checkUser(key *datastore.Key) {
	if !self.isInLibrary(key) {
		check(ErrUnknownItem)
	}
}
// returns true iff the key is part of the current library
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

// encode the object as JSON and write it so the response stream
//  write the data to the memcache as well so future requests
//  can skip the datastore access
//  sets Content-Type header to application/json
func (self *context) sendJSON(object interface{}) {
	j, err := json.Marshal(object)
	check(err)
	self.w.Header().Set("Content-Type", "application/json")
	self.w.(io.Writer).Write(j)
	cacheKey := self.lid.Encode() + self.r.URL.Path
	switch self.r.Method {
	case "POST":
		// posting is adding a new item, the URL is the "collection"
		//  URL, and the new item is being returned
		// thus we should delete the now dirty collection from the cache
		//  and add the new item to the cache
		memcache.Delete(self.c, cacheKey)
		if cacheKey[len(cacheKey)-1] != '/' {
			memcache.Delete(self.c, cacheKey+"/")
		} else {
			memcache.Delete(self.c, cacheKey[:len(cacheKey)-1])
		}
		if ider, ok := object.(Ided); ok {
			if cacheKey[len(cacheKey)-1] != '/' {
				cacheKey += "/"
			}
			cacheKey += ider.ID()
			memcache.Set(self.c, &memcache.Item{Key: cacheKey, Value: j})
		}
	case "PUT":
		// PUT is updating an item, we should update the cache
		//  with this item, and clear the parent collection
		memcache.Set(self.c, &memcache.Item{Key: cacheKey, Value: j})
		id := getID(self.r)
		parentKey := cacheKey[:len(cacheKey)-len(id)]
		memcache.Delete(self.c, parentKey)
		memcache.Delete(self.c, parentKey[:len(parentKey)-1])
	case "GET":
		//  GETs are getting the item, we should add to the cache
		memcache.Set(self.c, &memcache.Item{Key: cacheKey, Value: j})
	case "DELETE":
		// we shouldn't get here, deletes don't send back JSON
	}
}

// encode the object in JSON, nicely indented, and write 
//  the response with application/json content-type
func (self *context) sendJSONIndent(object interface{}) {
	j, err := json.MarshalIndent(object, "", "\t")
	check(err)
	self.w.Header().Set("Content-Type", "application/json")
	self.w.(io.Writer).Write(j)
}

// dataHandler to generalize the GET/POST/PUT/DELETE handling for the client interface
type dataHandler struct {
	context
   // the Datastore entity 'kind'
	kind    string
   // a factory to generate a new item for receiving datastore and JSON data
	factory func() Ided
   // the field from the data store for ordering a query (used for getAll)
   orderField string
}

// factory for data handler
func newDataHandler(c *context, kind string, factory func() Ided, orderField string) *dataHandler {
	return &dataHandler{*c, kind, factory, orderField}
}

// handle the data request, calling the optional callback when complete
// handles GET/POST with no key to get the whole collection or create a new item
// handles GET/PUT/DELETE with a key to get, update and remove the given item
// this method will validate data and check permissions
// after completion, the optional callback is called with key and item reference
//  item is nil for DELETE and GET(all)
//  key is nil for GET(all)
//  method specifies which HTTP method was used
func (self *dataHandler) handleRequest(ancestor *datastore.Key,
   callback func (method string, key *datastore.Key, item Ided)) {
   id := getID(self.r)
   var key *datastore.Key
   var item Ided
   // handle request with no specific ID
	if len(id) == 0 {
		switch self.r.Method {
		case "GET":
         // we return a JSON list of all items
			self.getAll(ancestor)
		case "POST":
         // we create a new item and return it
			key, item = self.createEntry(ancestor)
      default:
         check(ErrUnsupported)
		}
	} else {
      // we are working with a specific id, validate it
      var err os.Error
	   key, err = datastore.DecodeKey(id)
	   check(err)
	   if key.Incomplete() {
		   check(ErrUnknownItem)
	   }
	   self.checkUser(key)
      // handle the get, update and delete methods
	   switch self.r.Method {
	   case "GET":
		   item = self.get(key)
	   case "PUT":
		   item = self.update(key)
	   case "DELETE":
		   self.delete(key)
      default:
         check(ErrUnsupported)
	   }
   }
   // call the callback if we have one
   if callback != nil {
      callback(self.r.Method, key, item)
   }
}

// send back JSON for every item returned by the query
//  fixing up the Id fields for each
func (self *dataHandler) getAll(ancestor *datastore.Key) {
	query := datastore.NewQuery(self.kind).Ancestor(ancestor)
	if len(self.orderField) != 0 {
		query = query.Order(self.orderField)
	}
	items := make([]interface{}, 0, 100)
	item := self.factory()
	iter := query.Run(self.c)
	for key, err := iter.Next(item); err != datastore.Done; key, err = iter.Next(item) {
		check(err)
		item.SetID(key.Encode())
		items = append(items, item)
		item = self.factory()
	}
	self.sendJSON(items)
}

// default data handler for "POST" to create an item
// returns the new key and new item
func (self *dataHandler) createEntry(parent *datastore.Key) (*datastore.Key, Ided) {
	// use the library as parent if we don't have an immediate
	// parent
	if parent == nil {
		parent = self.lid
	}
	r := self.r
	c := self.c
   // use the factory to create an item
   item := self.factory()
   // read the JSON from client
	readJSON(r, item)
   // create a new datastore key
	key := datastore.NewIncompleteKey(c, self.kind, parent)
   // save the new item
	key, err := datastore.Put(c, key, item)
	check(err)
   // write the key into the Id field for the JSON response to address
   //  the new item
	item.SetID(key.Encode())
   // send back the response and cache it
	self.sendJSON(item)
   // return the new key and item
	return key, item
}
// default data handler for "GET" to fetch one item
// returns the fetched item
func (self *dataHandler) get(key *datastore.Key) Ided {
   // create the object
   object := self.factory()
   // fetch it from the data sstore
	err := datastore.Get(self.c, key, object)
	check(err)
   // ensure the item has the proper Id in the JSON to the client
	object.SetID(key.Encode())
   // send the object to the client and cache it
	self.sendJSON(object)
   return object
}
// default data handler for "PUT" to update one item
// returns the updated item
func (self *dataHandler) update(key *datastore.Key) Ided {
   // create object to receive data
   object := self.factory()
   // read the JSON
	readJSON(self.r, object)
	// don't let user change the ID
	object.SetID(key.Encode())
   // save to the datastore
	_, err := datastore.Put(self.c, key, object)
	check(err)
   // send JSON back to the client and cache it
	self.sendJSON(object)
   return object
}

// default data handler for "DELETE" to remove one itme
func (self *dataHandler) delete(key *datastore.Key) {
   // delete the item
	err := datastore.Delete(self.c, key)
	check(err)
	// remove this item from the cache
	cacheKey := self.lid.Encode() + self.r.URL.Path
	memcache.Delete(self.c, cacheKey)
	// remove the parent from the cache too
	// strip off the key from the URL
	parentURL := cacheKey[:len(cacheKey)-len(key.Encode())]
	memcache.Delete(self.c, parentURL)
	// also without the /
	memcache.Delete(self.c, parentURL[:len(parentURL)-1])
}

// fetch the user's own library (not necessarily their current library)
// checks memcache first, then datastore.  Populates the cache
// returns the key, library and a boolean that is true if the library is new
func getOwnLibrary(c appengine.Context, u *user.User) (*datastore.Key, *Library, bool) {
	uid := u.Id
	if len(uid) == 0 {
		uid = u.Email
	}
	init := false
	lid := datastore.NewKey(c, "Library", uid, 0, nil)
	l := &Library{}
	_, err := memcache.Gob.Get(c, lid.Encode(), l)
	if err == memcache.ErrCacheMiss {
		err = datastore.Get(c, lid, l)
		if err == datastore.ErrNoSuchEntity {
			l = &Library{uid, 0, u.String(), ""}
			lid, err = datastore.Put(c, lid, l)
			check(err)
			init = true
		}
		memcache.Gob.Set(c, &memcache.Item{Key: lid.Encode(), Object: l})
	}
	return lid, l, init
}

// get a permision item for the specified library
// checks memcache before datastore
func getLibPerm(c appengine.Context, uid string, libKey *datastore.Key) *Perm {
	accessCacheKey := uid + "Perm" + libKey.Encode()
	perm := &Perm{}
	_, err := memcache.Gob.Get(c, accessCacheKey, perm)
	if err != nil {
		query := datastore.NewQuery("Perm").Ancestor(libKey).Filter("UserId =", uid).Limit(1)
		iter := query.Run(c)
		if _, err = iter.Next(perm); err == nil {
			// save the permision back to the cache
			memcache.Gob.Set(c, &memcache.Item{Key: accessCacheKey, Object: perm})
		} else {
			return nil
		}
	}
	return perm
}

// structure to read search parameters from client's post
type searchParams struct {
   // list of tags that must match
	Tags   []string
   // space/comma separated list of keywords to search for
	Word   string
}
// handler for search requests, client "POST"s searchParams as JSON
func searchHandler(c *context) {
   // decode the JSON search parameters
	sp := searchParams{}
	readJSON(c.r, &sp)
   // create a channel for goroutines to send back search results
	resultsChannel := make(chan map[string]map[string]uint)
   // count how many goroutines we start so we read all the results back from the channel
	var queries uint = 0

	// start a goroutine to search for items each specified tag
   // the merge will do the "and" operation to constrain them
	if len(sp.Tags) > 0 {
		for _, target := range sp.Tags {
         word := target
			go func() {
            // fetch the tags that match 
				query := c.NewQuery("Tags").KeysOnly()
				query.Filter("Word=", word)
				keys, err := query.GetAll(c.c, nil)
				check(err)
				results := make(map[string]map[string]uint)
				addResults(keys, results)
            // send the results through the channel
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
         // send the results through the channel
			resultsChannel <- results
		}()
		queries++
	}

   // merge the results from all the queries
	results := mergeResults(resultsChannel, queries)
	c.sendJSON(results)
}
// loop through the results, adding them to a two level map keyed on the entity
//  kind (Dish,Ingredient) and then the item itself, counting how many
// times we come across each item
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
// add results as above for multiple items
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
   // for each additional set we get, make a new map
   // keeping only items that appear in both results
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

// handler to get all tags in this library
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

// handler to create JSON to backup all data in the current library
func backupHandler(c *context) {
   // initialize the backup structures
	b := backup{}
	b.MeasuredIngredients = map[string][]MeasuredIngredient{}
	b.Tags = map[string][]Word{}
	b.Pairings = map[string][]Pairing{}

   // gather all the dishes
	query := c.NewQuery("Dish")
	keys, err := query.GetAll(c.c, &b.Dishes)
	check(err)
   // TODO handle children on their own at the end not with separate queries for each
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

// handler to restore data, uses import.go
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
	key := datastore.NewIncompleteKey(c.c, "Share", c.lid)
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
	permKey := datastore.NewIncompleteKey(c.c, "Perm", libKey)
	permKey, err = datastore.Put(c.c, permKey, &perm)
	if err != nil {
		fmt.Fprintf(c.w, "We're sorry, the service failed to complete this operation, please try again.")
		return
	}
	// delete the share request so it can't be used again
	datastore.Delete(c.c, key)
	accessCacheKey := uid + "Perm" + libKey.Encode()
	memcache.Gob.Set(c.c, &memcache.Item{Key: accessCacheKey, Object: &perm})

	// update the user's record to use the shared library
	c.l.UserPreferredLibrary = libKey.Encode()
	datastore.Put(c.c, c.lid, c.l)
	memcache.Gob.Set(c.c, &memcache.Item{Key: c.lid.Encode(), Object: c.l})
	indexHandler(c)
}

// structure for JSON encoding of library information to give the client
type UserLibrary struct {
	Id       *datastore.Key
	Name     string
	ReadOnly bool
	Current  bool
	Owner    bool
}
// return a list of libraries this user can access
func librariesHandler(c *context) {
	lid, l, _ := getOwnLibrary(c.c, c.u)
	uid := c.getUid()
	libraries := make([]UserLibrary, 0, 10)
	libraries = append(libraries, UserLibrary{lid, l.Name, false, lid.Eq(c.lid), true})
	query := datastore.NewQuery("Perm").Filter("UserId=", uid)
	perm := Perm{}
	iter := query.Run(c.c)
   for key, err := iter.Next(&perm); err != datastore.Done; key, err = iter.Next(&perm) {
      check(err)
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
	desiredKey, err := datastore.DecodeKey(getID(c.r))
	check(err)
	if desiredKey.Kind() != "Library" {
		check(ErrUnknownItem)
	}
	// start by getting the user's own library
	lid, l, _ := getOwnLibrary(c.c, c.u)
	if !lid.Eq(desiredKey) {
		// user want's to see someone else's library, check if they have
		// permission
		perm := getLibPerm(c.c, c.uid, desiredKey)
		if perm == nil {
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
		l.UserPreferredLibrary = desiredKey.Encode()
	} else {
		l.UserPreferredLibrary = ""
	}
	_, err = datastore.Put(c.c, lid, l)
	check(err)
	memcache.Gob.Set(c.c, &memcache.Item{Key: lid.Encode(), Object: l})
	indexHandler(c)
}

// handler to delete entire library
func deletelibHandler(c *context) {
	lid, _, _ := getOwnLibrary(c.c, c.u)
	err := datastore.Delete(c.c, lid)
	check(err)
	memcache.Delete(c.c, lid.Encode())
	memcache.Delete(c.c, lid.Encode() + "/dish")
	memcache.Delete(c.c, lid.Encode() + "/dish/")
	memcache.Delete(c.c, lid.Encode() + "/ingredient")
	memcache.Delete(c.c, lid.Encode() + "/ingredient/")
	memcache.Delete(c.c, lid.Encode() + "/menu")
	memcache.Delete(c.c, lid.Encode() + "/menu/")
}
