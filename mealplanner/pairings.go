package mealplanner

import (
	"appengine/datastore"
)

type Pairing struct {
	Id          string
	Other       *datastore.Key
	Description string
}

func (self *Pairing) ID() string {
	return self.Id
}
func (self *Pairing) SetID(id string) {
	self.Id = id
}
