package mealplanner

import (
	"appengine/datastore"
)

type Ingredient struct {
	Id       *datastore.Key
	Name     string
	Category string
	Source   string // vegan, vegetarian, animal
}

func (self *Ingredient) ID() *datastore.Key {
	return self.Id
}
func (self *Ingredient) SetID(id *datastore.Key) {
	self.Id = id
}
