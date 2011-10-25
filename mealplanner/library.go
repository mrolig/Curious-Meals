package mealplanner

import (
	"appengine/datastore"
)

type Library struct {
	Id              *datastore.Key
	OwnerId         string
}


func (self *Library) Owner() string {
	return self.OwnerId
}
func (self *Library) SetOwner(o string) {
	self.OwnerId = o
}

func (self *Library) ID() *datastore.Key {
	return self.Id
}
func (self *Library) SetID(id *datastore.Key) {
	self.Id = id
}

