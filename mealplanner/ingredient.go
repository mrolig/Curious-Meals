package mealplanner

import ()

type Ingredient struct {
	Id       string
	User     string
	Name     string
	Category string
	Tags     []string
	Source   string // vegan, vegetarian, animal
}

func (self *Ingredient) Owner() string {
	return self.User
}
func (self *Ingredient) SetOwner(o string) {
	self.User = o
}

func (self *Ingredient) ID() string {
	return self.Id
}
func (self *Ingredient) SetID(id string) {
	self.Id = id
}
