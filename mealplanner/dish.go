package mealplanner

import (
	"appengine/datastore"
)

type Dish struct {
	Id              string
	Name            string
	DishType        string
	PrepTimeMinutes int
	CookTimeMinutes int
	Rating          int
	Source          string
	ServingsCarb    float32
	ServingsProtein float32
	ServingsVeggies float32
	Text            string
}

type MeasuredIngredient struct {
	Id          string
	Ingredient  *datastore.Key
	Amount      string
	Instruction string
	Order       int
}

func (self *Dish) ID() string {
	return self.Id
}
func (self *Dish) SetID(id string) {
	self.Id = id
}

func (self *MeasuredIngredient) ID() string {
	return self.Id
}
func (self *MeasuredIngredient) SetID(id string) {
	self.Id = id
}
