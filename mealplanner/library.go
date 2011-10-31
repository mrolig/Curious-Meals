package mealplanner

import (
	"appengine/datastore"
)

// root of all elements, owned by exactly one user
//  may have children specifying sharing for other users
type Library struct {
	Id              *datastore.Key
	OwnerId         string
	Version         int
	Name            string
	// which library does the owner of this library want to see
	//  nil means the user's own library
	UserPreferredLibrary *datastore.Key
}

// permission granting access to another user
type Perm struct {
	UserId		string
	ReadOnly		bool
}

// Record that a library request to be shared has been made
//   key == handle to find the request
//   parent == library to be shared
//  ExpirationDate specifies when the request will expire
//  ReadOnly specifies level of sharing to allow
type Share struct {
	ExpirationDate int64
	ReadOnly		bool
}


func (self *Library) Owner() string {
	return self.OwnerId
}
func (self *Library) SetOwner(o string) {
	self.OwnerId = o
}

func (self *Library) ID() *datastore.Key {
	return self.Id
}
func (self *Library) SetID(id *datastore.Key) {
	self.Id = id
}

