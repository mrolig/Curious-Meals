package mealplanner

import (
)

type Ingredient struct {
	Id       string
	Name     string
	Category string
	Source   string // vegan, vegetarian, animal
}

func (self *Ingredient) ID() string {
	return self.Id
}
func (self *Ingredient) SetID(id string) {
	self.Id = id
}
