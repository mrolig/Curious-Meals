package mealplanner
// file containing all of the datastore data-structures

import (
	"appengine/datastore"
)

// root of all elements, owned by exactly one user
//  may have children specifying sharing for other users
type Library struct {
   // OwnerId is the user id of the user that owns this library
	OwnerId string
   // what version of the datastructure is used (for forward compatibility)
	Version int
   // The name of the library
	Name    string
	// which library does the owner of this library want to see
	//  nil means the user's own library
	UserPreferredLibrary string
}

// permission granting access to another user
// Child of Library
type Perm struct {
   // the user id receiving permissions
	UserId   string
   // true if the user can only view the library
	ReadOnly bool
}

// Record that a library request to be shared has been made
//   key == handle to find the request
//   parent == library to be shared
//  ExpirationDate specifies when the request will expire
//  ReadOnly specifies level of sharing to allow
// Child of Library
type Share struct {
   // date that the request expires
	ExpirationDate int64
   // true if the user can only view the library
	ReadOnly       bool
}

// interface that allows getting/setting ID string field
type Ided interface {
	ID() string
	SetID(string)
}

// Fields describing a dish
// Child of Library
type Dish struct {
   // Id -- used to hold datastore key in JSON for the browser
   //  also used as the imported id to allow multiple restores to not create duplicates
	Id              string
   // Name of the dish
	Name            string
   // The role the dish plays in a meal
	DishType        string
   // How long to prepare the ingredients
	PrepTimeMinutes int
   // How long to cook the ingredients
	CookTimeMinutes int
   // User's rating (1-5)
	Rating          int
   // Source of the recipe (cookbook, url, etc)
	Source          string
   // how many servings of carbohydrates are in a single serving of the dish
	ServingsCarb    float32
   // how many servings of protein are in a single serving of the dish
	ServingsProtein float32
   // how many servings of veggetables are in a single serving of the dish
	ServingsVeggies float32
   // free-form text from the user
	Text            string
}

// Record linking a dish to ingredients in the dish
// Child of Dish
type MeasuredIngredient struct {
   // Id -- used to hold datastore key in JSON for the browser, stored value isn't used
	Id          string
   // key of the ingredient being used in this dish
	Ingredient  *datastore.Key
   // The amount of the ingredient used in this dish
	Amount      string
   // Instructions for preparing the ingredient for this dish
	Instruction string
   // The order in which the ingredient appears in the dish
	Order       int
}

// Record of an ingredient that can be used in dishes
// Child of Library
type Ingredient struct {
   // Id -- used to hold datastore key in JSON for the browser, stored value isn't used
	Id       string
   // Name of the ingredient
	Name     string
   // Category (e.g. Veggetable, Fruit, Protein, etc)
	Category string
   // Is this vegan, vegetarian, or from an animal
	Source   string
}

// Collection of dishes to be presented as a menu
// Child of Library
type Menu struct {
   // Id -- used to hold datastore key in JSON for the browser, stored value isn't used
	Id     string
   // Name of the menu
	Name   string
   // List of dishes in this menu
	Dishes []*datastore.Key
}

// Simple string type, used for Tags and Keyword
// Child of Ingredient or Dish or Menu
type Word struct {
   // Id -- used to hold datastore key in JSON for the browser, stored value isn't used
	Id   string
   // Text for this item
	Word string
}

// Link between two dishes (should have two entries, one under each dish)
//  presents them as suggestions to go together, or as an alternative
// Child of Dish
type Pairing struct {
   // Id -- used to hold datastore key in JSON for the browser, stored value isn't used
	Id          string
   // Key of the dish being suggested
	Other       *datastore.Key
   // Description of the suggestion ("Recommended" or "Alternative")
	Description string
}

// get the owner of the library
func (self *Library) Owner() string {
	return self.OwnerId
}
// set the owner of the library
func (self *Library) SetOwner(o string) {
	self.OwnerId = o
}

// Methods implementing the Ided interface
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

func (self *Ingredient) ID() string {
	return self.Id
}
func (self *Ingredient) SetID(id string) {
	self.Id = id
}

func (self *Menu) ID() string {
	return self.Id
}
func (self *Menu) SetID(id string) {
	self.Id = id
}

func (self *Word) ID() string {
	return self.Id
}
func (self *Word) SetID(id string) {
	self.Id = id
}

func (self *Pairing) ID() string {
	return self.Id
}
func (self *Pairing) SetID(id string) {
	self.Id = id
}
