package mealplanner

import (
	"appengine/datastore"
)

type Menu struct {
	Id       *datastore.Key
	Name     string
	Dishes   []*datastore.Key
}

func (self *Menu) ID() *datastore.Key {
	return self.Id
}
func (self *Menu) SetID(id *datastore.Key) {
	self.Id = id
}
