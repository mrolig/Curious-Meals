package mealplanner

import (
	"appengine/datastore"
	"appengine"
	"io"
	"os"
	"json"
	//"fmt"
)

type backup struct {
	Dishes              []Dish
	Ingredients         []Ingredient
	MeasuredIngredients map[string][]MeasuredIngredient
	Tags                map[string][]Word
	Pairings            map[string][]Pairing
	Menus               []Menu
}

type importer struct {
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
	allTags map[string]map[string] bool
	// slice of all new tags to be added
	newTags []interface{}
	// slice of the keys for the new tags to be added
	newTagKeys []*datastore.Key
}

func importFile(c *context, file io.Reader) {
	datastore.RunInTransaction(c.c, func(tc appengine.Context) os.Error {
		decoder := json.NewDecoder(file)
		data := backup{}
		err := decoder.Decode(&data)
		check(err)
		worker := &importer{
				context: *c,
				jsonData : data,
				fixUpKeys : make(map[string]*datastore.Key),
				allTags : make(map[string]map[string] bool),
				newTags : make([]interface{}, 0, 100),
				newTagKeys : make([]*datastore.Key, 0, 100),
		}
		worker.c = tc
		worker.doImport()
		return nil
	}, nil)
}

func (self *importer) doImport() {
	//fmt.Fprintf(self.w, "indexTags %v\n", self.allTags)
	self.indexCurrentTags()
	//self.debugPrintTags()
	//fmt.Fprintf(self.w, "ingredients\n")
	self.importIngredients()
	//fmt.Fprintf(self.w, "Dishes\n")
	self.importDishes()
	//self.debugPrintTags()
	//fmt.Fprintf(self.w, "MIs\n")
	self.importMeasuredIngredients()
	//fmt.Fprintf(self.w, "pairings\n")
	self.importPairings()
	//fmt.Fprintf(self.w, "menus\n")
	self.importMenus()
	//fmt.Fprintf(self.w, "tags\n")
	// add the tags we collected
	_, err := datastore.PutMulti(self.c, self.newTagKeys, self.newTags)
	check(err)
}

func (self *importer) indexCurrentTags() {
	// build an index of tags, (dish|ingredient)key -> tagstr -> tagkey
	query := self.NewQuery("Tags")
	iter := query.Run(self.c)
	word := &Word{}
	for key, err := iter.Next(word);
		err == nil;
		key, err = iter.Next(word) {
		parent := key.Parent().Encode()
		var m map[string]bool
		var found bool
		//fmt.Fprintf(self.w, "indexTags parent %v %v\n", parent, word.Word)
		if m, found = self.allTags[parent]; !found {
			//fmt.Fprintf(self.w, "indexTags make\n")
			m = make(map[string]bool)
			self.allTags[parent] = m
		}
		//fmt.Fprintf(self.w, "indexTags m %v\n", m)
		m[word.Word] = true
	}
}

func (self *importer) debugPrintTags() {
	j, _ := json.MarshalIndent(self.allTags, "", "\t")
	self.w.Write(j)
}

func (self *importer) restoreKey(encoded string, parent *datastore.Key) *datastore.Key {
	key, err := datastore.DecodeKey(encoded)
	check(err)
	if newKey, found := self.fixUpKeys[encoded]; found {
		return newKey
	}
	if !self.isInLibrary(key) {
		newKey := datastore.NewIncompleteKey(self.c, key.Kind(), parent)
		self.fixUpKeys[encoded] = newKey
		return newKey
	}
	return key
}

func (self *importer) importIngredients() {
	// get the previously listed ingredients
	// build an index by name
	prevIngredientsByName := self.indexItems(self.NewQuery("Ingredient"),
		&Ingredient{},
		func(key *datastore.Key, item interface{}) string {
			return item.(*Ingredient).Name
		})
	putItems := make([]interface{}, 0, len(self.jsonData.Ingredients))
	putKeys := make([]*datastore.Key, 0, len(self.jsonData.Ingredients))
	putIds := make([]string, 0, len(self.jsonData.Ingredients))

	// prepare all the ingredients
	for index, _ := range self.jsonData.Ingredients {
		i := &self.jsonData.Ingredients[index]
		id := i.Id
		key := self.restoreKey(id, self.lid)
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
	for index, putKey := range putKeys {
		if putKey.Incomplete() {
			self.fixUpKeys[putIds[index]] = outKeys[index]
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

//jsonData.MeasuredIngredients map[string][]MeasuredIngredient
func (self *importer) importMeasuredIngredients() {
	miKeyFunc := func (key *datastore.Key, item interface{}) string {
				return key.Parent().Encode() + item.(*MeasuredIngredient).Ingredient.Encode();
			}
	// index existing items by their parent dish and the ingredient
	//  they reference
	prevMIs := self.indexItems(self.NewQuery("MeasuredIngredient"),
			 &MeasuredIngredient{}, miKeyFunc)
	count := len(self.jsonData.MeasuredIngredients)
	putItems := make([]interface{}, 0, count)
	putKeys := make([]*datastore.Key, 0, count)

	for dishId, jsonMis := range self.jsonData.MeasuredIngredients {
		dishKey := self.restoreKey(dishId, self.lid)
		dishKeyEncoded := dishKey.Encode()
		for index, _ := range jsonMis {
			jsonMi := &jsonMis[index]
			miKey := self.restoreKey(jsonMi.Id, dishKey)
			ingKey := self.restoreKey(jsonMi.Ingredient.Encode(), self.lid)
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
	}
}

//jsonData.Pairings map[string][]Pairing
func (self *importer) importPairings() {
	pairingKeyFunc := func (key *datastore.Key, item interface{}) string {
					  return key.Parent().Encode() + item.(*Pairing).Other.Encode() + item.(*Pairing).Description;
				  }
	// index existing items by their parent dish and the ingredient
	//  they reference
	prevPairings := self.indexItems(self.NewQuery("Pairing"),
			 &Pairing{}, pairingKeyFunc)
	count := len(self.jsonData.Pairings)
	putItems := make([]interface{}, 0, count)
	putKeys := make([]*datastore.Key, 0, count)

	for dishId, jsonPairings := range self.jsonData.Pairings {
		dishKey := self.restoreKey(dishId, self.lid)
		dishKeyEncoded := dishKey.Encode()
		for index, _ := range jsonPairings {
			jsonPairing := &jsonPairings[index]
			pairingKey := self.restoreKey(jsonPairing.Id, dishKey)
			otherKey := self.restoreKey(jsonPairing.Other.Encode(), self.lid)
			pairingIndexKey := dishKeyEncoded + otherKey.Encode() + jsonPairing.Description
			// add the new pairing if it wasn't already present
			if _, found := prevPairings[pairingIndexKey]; !found {
				jsonPairing.Other = otherKey
				jsonPairing.Id = ""
				putItems = append(putItems, jsonPairing)
				putKeys = append(putKeys, pairingKey)
			}
		}
	}
	if len(putKeys) > 0 {
		_, err := datastore.PutMulti(self.c, putKeys, putItems)
		check(err)
	}
}

func (self *importer) importMenus() {
	menuKeyFunc := func (key *datastore.Key, item interface{}) string {
						 return item.(*Menu).Name
					 }
	// index existing items by their name
	prevMenus := self.indexItems(self.NewQuery("Menu"), &Menu{},
						  menuKeyFunc)
	count := len(self.jsonData.Menus)
	putItems := make([]interface{}, 0, count)
	putKeys := make([]*datastore.Key, 0, count)
	for index, _ := range self.jsonData.Menus {
		jsonMenu := &self.jsonData.Menus[index]
		key := self.restoreKey(jsonMenu.Id, self.lid)
		if key.Incomplete() {
			if existingKey, found := prevMenus[jsonMenu.Name]; found {
				key = existingKey
			}
		}
		for index, dishKey := range jsonMenu.Dishes {
			jsonMenu.Dishes[index] = self.restoreKey(dishKey.Encode(), self.lid)
		}
		jsonMenu.Id = ""
		putItems = append(putItems, jsonMenu)
		putKeys = append(putKeys, key)
	}
	if len(putKeys) > 0 {
		_, err := datastore.PutMulti(self.c, putKeys, putItems)
		check(err)
	}
}


// jsonData.Tags map[string][]Word
// take a slice of ids as appeared in json and slice of
//  keys as now stored for items with tags
// add any tags for these items that were in json but not yet stored
func (self *importer) importTags (ids []string, keys []*datastore.Key) {
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
					self.newTags = append(self.newTags, &Word{"",tag.Word})
					newTagKey := datastore.NewIncompleteKey(self.c, "Tags", parentKey)
					self.newTagKeys = append(self.newTagKeys, newTagKey)
					myTags[tag.Word] = true
				}
			}
		}
	}
}

func (self *importer) indexItems(query *datastore.Query, item interface{},
	keyFunc func (*datastore.Key, interface{}) string ) map[string]*datastore.Key {
	index := make(map[string]*datastore.Key)
	iter := query.Run(self.c)
	for dataKey, err := iter.Next(item);
			err == nil;
			dataKey, err = iter.Next(item) {
		indexKey := keyFunc(dataKey, item)
		if len(indexKey) > 0 {
			index[indexKey] = dataKey
		}
	}
	return index
}

