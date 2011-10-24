package mealplanner

import (
	"appengine/datastore"
)

type Dish struct {
	Id              string
	User            string
	Name            string
	DishType        string
	Tags            []string
	PrepTimeMinutes int
	CookTimeMinutes int
	Rating          int
	Source          string
}

type MeasuredIngredient struct {
	Id          string
	User        string
	Ingredient  *datastore.Key
	Amount      string
	Instruction string
	Order       int
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
func (self *Dish) SetID(id string) {
	self.Id = id
}

func (self *MeasuredIngredient) Owner() string {
	return self.User
}
func (self *MeasuredIngredient) SetOwner(o string) {
	self.User = o
}

func (self *MeasuredIngredient) ID() string {
	return self.Id
}
func (self *MeasuredIngredient) SetID(id string) {
	self.Id = id
}
