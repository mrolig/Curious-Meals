package mealplanner

import (
	"appengine/datastore"
)

type Dish struct {
	Id              *datastore.Key
	Name            string
	DishType        string
	Tags            []string
	PrepTimeMinutes int
	CookTimeMinutes int
	Rating          int
	Source          string
}

type MeasuredIngredient struct {
	Id          *datastore.Key
	Ingredient  *datastore.Key
	Amount      string
	Instruction string
	Order       int
}

func (self *Dish) ID() *datastore.Key {
	return self.Id
}
func (self *Dish) SetID(id *datastore.Key ) {
	self.Id = id
}

func (self *MeasuredIngredient) ID() *datastore.Key {
	return self.Id
}
func (self *MeasuredIngredient) SetID(id *datastore.Key) {
	self.Id = id
}
