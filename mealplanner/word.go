package mealplanner

import ()

type Word struct {
	Id   string
	Word string
}

func (self *Word) ID() string {
	return self.Id
}
func (self *Word) SetID(id string) {
	self.Id = id
}
