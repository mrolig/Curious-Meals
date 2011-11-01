package mealplanner

import (
	"appengine/datastore"
)

type Menu struct {
	Id     string
	Name   string
	Dishes []*datastore.Key
}

func (self *Menu) ID() string {
	return self.Id
}
func (self *Menu) SetID(id string) {
	self.Id = id
}
