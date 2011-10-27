package mealplanner

import (
	"appengine/datastore"
)

type Pairing struct {
	Id       *datastore.Key
	Other    *datastore.Key
	Description string
}

func (self *Pairing) ID() *datastore.Key {
	return self.Id
}
func (self *Pairing) SetID(id *datastore.Key) {
	self.Id = id
}
