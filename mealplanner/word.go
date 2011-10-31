package mealplanner

import (
	"appengine/datastore"
)

type Word struct {
	Id   *datastore.Key
	Word string
}

func (self *Word) ID() *datastore.Key {
	return self.Id
}
func (self *Word) SetID(id *datastore.Key) {
	self.Id = id
}
