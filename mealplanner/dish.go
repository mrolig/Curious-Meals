package mealplanner

import (
	"appengine/datastore"
)

type Dish struct {
	Id string
	User string
	Name string
	DishType string
	Ingredients []*datastore.Key
	Tags []string
	PrepTimeMinutes int
	CookTimeMinutes int
	Rating int
}

func (self *Dish) Owner() string {
	return self.User
}
func (self *Dish) SetOwner(o string) {
	self.User = o
}

func (self *Dish) ID() string {
	return self.Id
}
func (self *Dish) SetID(o string) {
	self.Id = o
}
