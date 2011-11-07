package mealplanner
// import function to allow importing a big JSON file with all the data

import (
	"appengine"
	"appengine/datastore"
	"appengine/memcache"
	"io"
	"os"
	"json"
)

// the structure holding all data for JSON serialization
type backup struct {
	Dishes              []Dish
	Ingredients         []Ingredient
   // mapping from the data store key of items to their children
	MeasuredIngredients map[string][]MeasuredIngredient
	Tags                map[string][]Word
	Pairings            map[string][]Pairing
	Menus               []Menu
}

// class to handle the import
type importer struct {
   // "inherit" the context
	context
	// decoded JSON data being imported
	jsonData backup
	// mapping from the string-id present in the jsonData
	//  to the actual datastore key of the entity after import
	//  only for the case that the string-id isn't a valid key for our
	//  library
	fixUpKeys map[string]*datastore.Key
	// an index of tags, (dish|ingredient)key -> tagstr -> dummy
	//  keyed based on the actual datastore key we will use, not
	//  the string from json
	allTags map[string]map[string]bool
	// slice of all new tags to be added
	newTags []interface{}
	// slice of the keys for the new tags to be added
	newTagKeys []*datastore.Key
	// slice of memcache entries that need to be purged
	dirtyCacheEntries []string
}

// method to import from JSON read with the file reader
func importFile(c *context, file io.Reader) {
   // run in a transaction so that each datastore write doesn't redo the index,
   //  rather all the indecies get updated at once when we're done
	datastore.RunInTransaction(c.c, func(tc appengine.Context) os.Error {
      // decode the data
		decoder := json.NewDecoder(file)
		data := backup{}
		err := decoder.Decode(&data)
		check(err)
      // setup a worker to do the work
		worker := &importer{
			context:           *c,
			jsonData:          data,
			fixUpKeys:         make(map[string]*datastore.Key),
			allTags:           make(map[string]map[string]bool),
			newTags:           make([]interface{}, 0, 100),
			newTagKeys:        make([]*datastore.Key, 0, 100),
			dirtyCacheEntries: make([]string, 0, 1000),
		}
		worker.c = tc
      // kick off the import
		worker.doImport()
		return nil
	}, nil)
}

// perform an import using the data we've decoded in jsonData
func (self *importer) doImport() {
   // initialize our list of dirty cache entries with the top-level items
   // these (and more) will be flushed from the cache when we're done
	self.dirtyCacheEntries = append(self.dirtyCacheEntries, []string{
		"/dish",
		"/dish/",
		"/menu",
		"/menu/",
		"/ingredient",
		"/ingredient/",
	}...)
   // build an index of the tags currently in the datastore
	self.indexCurrentTags()
	self.importIngredients()
	self.importDishes()
	self.importMeasuredIngredients()
	self.importPairings()
	self.importMenus()
	// add the tags we collected
	_, err := datastore.PutMulti(self.c, self.newTagKeys, self.newTags)
	check(err)
	// clear the cache
	lid := self.lid.Encode()
	// prefix each entry with the library id
	for i, _ := range self.dirtyCacheEntries {
		self.dirtyCacheEntries[i] = lid + self.dirtyCacheEntries[i]
	}
	// clear them all
	memcache.DeleteMulti(self.c, self.dirtyCacheEntries)
}

// build an index of tags, (dish|ingredient)key -> tagstr -> tagkey
func (self *importer) indexCurrentTags() {
   // query for all of the tags in this library
	query := self.NewQuery("Tags")
   // use the iterator to walk through results
	iter := query.Run(self.c)
	word := &Word{}
   // loop through the results from the iterator
	for key, err := iter.Next(word); err == nil; key, err = iter.Next(word) {
		parent := key.Parent().Encode()
      // add map for each parent we find
		var m map[string]bool
		var found bool
		if m, found = self.allTags[parent]; !found {
			m = make(map[string]bool)
			self.allTags[parent] = m
		}
      // add the word to the map for the parent
		m[word.Word] = true
	}
}

// debug output of the tags
func (self *importer) debugPrintTags() {
	j, _ := json.MarshalIndent(self.allTags, "", "\t")
	self.w.Write(j)
}

// restore a key, take the encoded datastore key from the JSON and
//  return a datastore key we can use.  If the key didn't come from our library
//  we will create a new one -- we use the parent we're given if we create a new key
func (self *importer) restoreKey(encoded string, parent *datastore.Key) *datastore.Key {
   // decode the key to a datastore.Key
	key, err := datastore.DecodeKey(encoded)
	check(err)
   // check if we've already fixed this one up
	if newKey, found := self.fixUpKeys[encoded]; found {
		return newKey
	}
   // if this isn't in our library, create a new key
	if !self.isInLibrary(key) {
		newKey := datastore.NewIncompleteKey(self.c, key.Kind(), parent)
		self.fixUpKeys[encoded] = newKey
		return newKey
	}
	return key
}

// import all ingredients from jsonData
func (self *importer) importIngredients() {
	// get the previously listed ingredients
	// build an index by name
	prevIngredientsByName := self.indexItems(self.NewQuery("Ingredient"),
		&Ingredient{},
		func(key *datastore.Key, item interface{}) string {
			return item.(*Ingredient).Name
		})
   // create slices to track items to be added, the keys, and the original JSON ids
	putItems := make([]interface{}, 0, len(self.jsonData.Ingredients))
	putKeys := make([]*datastore.Key, 0, len(self.jsonData.Ingredients))
	putIds := make([]string, 0, len(self.jsonData.Ingredients))

	// prepare all the ingredients, loop through the jsonData
	for index, _ := range self.jsonData.Ingredients {
		i := &self.jsonData.Ingredients[index]
		id := i.Id
      // restore the ky
		key := self.restoreKey(id, self.lid)
      // if we didn't find it, look for an ingredient with
      //  the same name so we can avoid duplicates
		if key.Incomplete() {
			// check if we have an item of the same name already
			if ikey, ok := prevIngredientsByName[i.Name]; ok {
				self.fixUpKeys[id] = ikey
				key = ikey
			}
		}
		i.Id = ""
		putItems = append(putItems, i)
		putKeys = append(putKeys, key)
		putIds = append(putIds, id)
	}
	// put all the ingredients
	outKeys, err := datastore.PutMulti(self.c, putKeys, putItems)
	check(err)
	// update the fixUpKeys for any new items
	// dirty the cache for any items that existed before
	for index, putKey := range putKeys {
		if putKey.Incomplete() {
			self.fixUpKeys[putIds[index]] = outKeys[index]
		} else {
			self.dirtyCacheEntries = append(self.dirtyCacheEntries, "/ingredient/"+putKey.Encode())
			self.dirtyCacheEntries = append(self.dirtyCacheEntries, "/ingredient/"+putKey.Encode()+"/tags/")
			self.dirtyCacheEntries = append(self.dirtyCacheEntries, "/ingredient/"+putKey.Encode()+"/keywords/")
		}
	}

	// add tags
	self.importTags(putIds, outKeys)
	// update keywords
	for index, _ := range putItems {
		ing := putItems[index].(*Ingredient)
		words := make(map[string]bool)
		addWords(ing.Name, words)
		addWords(ing.Category, words)
		for tag, _ := range self.allTags[outKeys[index].Encode()] {
			addWords(tag, words)
		}
		updateKeywords(self.c, outKeys[index], words)
	}
}

// import all of the dishes from jsonData
func (self *importer) importDishes() {
	// get the previously listed dishes
	// build an index by name
	prevDishesByImportId := self.indexItems(self.NewQuery("Dish"), &Dish{},
		func(key *datastore.Key, item interface{}) string {
			return item.(*Dish).Id
		})
	// lists for dishes being written
	count := len(self.jsonData.Dishes)
	putItems := make([]interface{}, 0, count)
	putKeys := make([]*datastore.Key, 0, count)
	putIds := make([]string, 0, count)

	// prepare all the dishes
	for index, _ := range self.jsonData.Dishes {
		i := &self.jsonData.Dishes[index]
		id := i.Id
		key := self.restoreKey(id, self.lid)
		if key.Incomplete() {
			// check if we have an item of the same name already
			if ikey, ok := prevDishesByImportId[id]; ok {
				self.fixUpKeys[id] = ikey
				key = ikey
			}
		}
		putItems = append(putItems, i)
		putKeys = append(putKeys, key)
		putIds = append(putIds, id)
	}
	// put all the dishes
	outKeys, err := datastore.PutMulti(self.c, putKeys, putItems)
	check(err)
	// update the fixUpKeys for any new items
	for index, putKey := range putKeys {
		if putKey.Incomplete() {
			self.fixUpKeys[putIds[index]] = outKeys[index]
		} else {
			self.dirtyCacheEntries = append(self.dirtyCacheEntries, "/dish/"+putKey.Encode())
			self.dirtyCacheEntries = append(self.dirtyCacheEntries, "/dish/"+putKey.Encode()+"/tags/")
			self.dirtyCacheEntries = append(self.dirtyCacheEntries, "/dish/"+putKey.Encode()+"/keywords/")
			self.dirtyCacheEntries = append(self.dirtyCacheEntries, "/dish/"+putKey.Encode()+"/pairing/")
			self.dirtyCacheEntries = append(self.dirtyCacheEntries, "/dish/"+putKey.Encode()+"/mi/")
		}
	}

	// add tags
	self.importTags(putIds, outKeys)
	// update keywords
	for index, _ := range putItems {
		dish := putItems[index].(*Dish)
		words := make(map[string]bool)
		addWords(dish.Name, words)
		addWords(dish.Source, words)
		for tag, _ := range self.allTags[outKeys[index].Encode()] {
			addWords(tag, words)
		}
		updateKeywords(self.c, outKeys[index], words)
	}
}

// import all measured ingredients fro jsonData
//jsonData.MeasuredIngredients map[string][]MeasuredIngredient
func (self *importer) importMeasuredIngredients() {
	// index existing items by their parent dish and the ingredient
	//  they reference
	miKeyFunc := func(key *datastore.Key, item interface{}) string {
		return key.Parent().Encode() + item.(*MeasuredIngredient).Ingredient.Encode()
	}
	prevMIs := self.indexItems(self.NewQuery("MeasuredIngredient"),
		&MeasuredIngredient{}, miKeyFunc)
   // slices of items to be written
	count := len(self.jsonData.MeasuredIngredients)
	putItems := make([]interface{}, 0, count)
	putKeys := make([]*datastore.Key, 0, count)

	for dishId, jsonMis := range self.jsonData.MeasuredIngredients {
		dishKey := self.restoreKey(dishId, self.lid)
		dishKeyEncoded := dishKey.Encode()
		for index, _ := range jsonMis {
			jsonMi := &jsonMis[index]
         // restore the key for the measure ingredient AND the ingredient reference
			miKey := self.restoreKey(jsonMi.Id, dishKey)
			ingKey := self.restoreKey(jsonMi.Ingredient.Encode(), self.lid)
			// if we didn't import the ingredient, we need to skip this one
			if ingKey.Incomplete() {
				continue
			}
         // if we don't have an entry yet, check if we already have
         //  a reference to this ingredient for this dish
			if miKey.Incomplete() {
				miIndexKey := dishKeyEncoded + ingKey.Encode()
				if existingKey, found := prevMIs[miIndexKey]; found {
					miKey = existingKey
				}
			}
			jsonMi.Ingredient = ingKey
			jsonMi.Id = ""
			putItems = append(putItems, jsonMi)
			putKeys = append(putKeys, miKey)
		}
	}
	if len(putKeys) > 0 {
		_, err := datastore.PutMulti(self.c, putKeys, putItems)
		check(err)
		// any modified entries need to be cleared from the cache
		for _, putKey := range putKeys {
			if !putKey.Incomplete() {
				self.dirtyCacheEntries = append(self.dirtyCacheEntries, "/dish/"+putKey.Parent().Encode()+"/mi/"+putKey.Encode())
			}
		}
	}
}

// import all dish pairings
//jsonData.Pairings map[string][]Pairing
func (self *importer) importPairings() {
	// index existing items by their parent dish and the ingredient
	//  they reference
	pairingKeyFunc := func(key *datastore.Key, item interface{}) string {
		return key.Parent().Encode() + item.(*Pairing).Other.Encode() + item.(*Pairing).Description
	}
	prevPairings := self.indexItems(self.NewQuery("Pairing"),
		&Pairing{}, pairingKeyFunc)
   // slices of items to be added
	count := len(self.jsonData.Pairings)
	putItems := make([]interface{}, 0, count)
	putKeys := make([]*datastore.Key, 0, count)

   // walk each pairing finding if we need to add the pairing given
	for dishId, jsonPairings := range self.jsonData.Pairings {
		dishKey := self.restoreKey(dishId, self.lid)
		dishKeyEncoded := dishKey.Encode()
		for index, _ := range jsonPairings {
			jsonPairing := &jsonPairings[index]
         // restore our own key and the reference key
			pairingKey := self.restoreKey(jsonPairing.Id, dishKey)
			otherKey := self.restoreKey(jsonPairing.Other.Encode(), self.lid)
			if otherKey.Incomplete() {
				// if we didn't import the referenced item
				//  we have to skip this one
				continue
			}
			pairingIndexKey := dishKeyEncoded + otherKey.Encode() + jsonPairing.Description
			// add the new pairing only if it wasn't already present
			if _, found := prevPairings[pairingIndexKey]; !found {
				jsonPairing.Other = otherKey
				jsonPairing.Id = ""
				putItems = append(putItems, jsonPairing)
				putKeys = append(putKeys, pairingKey)
			}
		}
	}
   // store the new pairings
	if len(putKeys) > 0 {
		_, err := datastore.PutMulti(self.c, putKeys, putItems)
		check(err)
		// any modified entries need to be cleared from the cache
		for _, putKey := range putKeys {
			if !putKey.Incomplete() {
				self.dirtyCacheEntries = append(self.dirtyCacheEntries, "/dish/"+putKey.Parent().Encode()+"/pairing/"+putKey.Encode())
			}
		}
	}
}

// import all menus from jsonData
func (self *importer) importMenus() {
	menuKeyFunc := func(key *datastore.Key, item interface{}) string {
		return item.(*Menu).Name
	}
	// index existing items by their name
	prevMenus := self.indexItems(self.NewQuery("Menu"), &Menu{},
		menuKeyFunc)
	count := len(self.jsonData.Menus)
   // slices of menu items to be stored
	putItems := make([]interface{}, 0, count)
	putKeys := make([]*datastore.Key, 0, count)
   // walk each menu
	for index, _ := range self.jsonData.Menus {
		jsonMenu := &self.jsonData.Menus[index]
      // get the key to store to
		key := self.restoreKey(jsonMenu.Id, self.lid)
		if key.Incomplete() {
         // check if we already have a menu by this name
			if existingKey, found := prevMenus[jsonMenu.Name]; found {
				key = existingKey
			}
		}
      // walk the dishes, keeping only the ones we can reference properly
		newDishes := make([]*datastore.Key, 0, len(jsonMenu.Dishes))
		for _, dishKey := range jsonMenu.Dishes {
			destKey := self.restoreKey(dishKey.Encode(), self.lid)
			if !destKey.Incomplete() {
				newDishes = append(newDishes, destKey)
			}
		}
      // add this menu to the list to be added
		jsonMenu.Dishes = newDishes
		jsonMenu.Id = ""
		putItems = append(putItems, jsonMenu)
		putKeys = append(putKeys, key)
	}
   // store the menus and clear the cache
	if len(putKeys) > 0 {
		_, err := datastore.PutMulti(self.c, putKeys, putItems)
		check(err)
		// any modified entries need to be cleared from the cache
		for _, putKey := range putKeys {
			if !putKey.Incomplete() {
				self.dirtyCacheEntries = append(self.dirtyCacheEntries, "/menu/"+"/menu/"+putKey.Encode())
			}
		}
	}
}

// jsonData.Tags map[string][]Word
// take a slice of ids as appeared in json and slice of
//  keys as now stored for items with tags
// add any tags for these items that were in json but not yet stored
func (self *importer) importTags(ids []string, keys []*datastore.Key) {
	for index, parentKey := range keys {
		parentId := ids[index]
		destId := keys[index].Encode()
		if importTags, ok := self.jsonData.Tags[parentId]; ok {
			var myTags map[string]bool
			// if this item doesn't have a tags collection yet,
			// add it
			var found bool
			if myTags, found = self.allTags[destId]; !found {
				myTags = make(map[string]bool)
				self.allTags[destId] = myTags
			}
			// go through tags from json
			for _, tag := range importTags {
				if _, found := myTags[tag.Word]; !found {
					// this tag doesn't exist yet, add to our list
					self.newTags = append(self.newTags, &Word{"", tag.Word})
					newTagKey := datastore.NewIncompleteKey(self.c, "Tags", parentKey)
					self.newTagKeys = append(self.newTagKeys, newTagKey)
					myTags[tag.Word] = true
				}
			}
		}
	}
}

// create an index for items, by calling the keyFunc function provided for each item
//  returning a map from those keys to the items
func (self *importer) indexItems(query *datastore.Query, item interface{},
keyFunc func(*datastore.Key, interface{}) string) map[string]*datastore.Key {
	index := make(map[string]*datastore.Key)
	iter := query.Run(self.c)
	for dataKey, err := iter.Next(item); err == nil; dataKey, err = iter.Next(item) {
		indexKey := keyFunc(dataKey, item)
		if len(indexKey) > 0 {
			index[indexKey] = dataKey
		}
	}
	return index
}
