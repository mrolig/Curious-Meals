package mealplanner

import (
	"appengine/datastore"
)

// root of all elements, owned by exactly one user
//  may have children specifying sharing for other users
type Library struct {
	OwnerId string
	Version int
	Name    string
	// which library does the owner of this library want to see
	//  nil means the user's own library
	UserPreferredLibrary string
}

// permission granting access to another user
type Perm struct {
	UserId   string
	ReadOnly bool
}

// Record that a library request to be shared has been made
//   key == handle to find the request
//   parent == library to be shared
//  ExpirationDate specifies when the request will expire
//  ReadOnly specifies level of sharing to allow
type Share struct {
	ExpirationDate int64
	ReadOnly       bool
}


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

type Ingredient struct {
	Id       string
	Name     string
	Category string
	Source   string // vegan, vegetarian, animal
}

type Menu struct {
	Id     string
	Name   string
	Dishes []*datastore.Key
}

type Word struct {
	Id   string
	Word string
}

type Pairing struct {
	Id          string
	Other       *datastore.Key
	Description string
}


func (self *Library) Owner() string {
	return self.OwnerId
}
func (self *Library) SetOwner(o string) {
	self.OwnerId = o
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
