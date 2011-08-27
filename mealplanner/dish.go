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

/*const (
	Entree string = "entree",
	Side string = "side",
	Appetizer string = "appetizer",
	Dessert string = "dessert",
	Drink string = "drink"
)*/

