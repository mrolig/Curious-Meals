// Copyright (c) 2011 Michael Rolig
// Distributed under the MIT License see file LICENSE
//  or license section in index.html
//
// load google's visualization for charts
google.load("visualization", "1", {packages:["corechart"]});

jQuery(function() {
   "use strict";
   // Base "class" for models, add in the parsing logic to fix-up "Id" attribute
   //  and make it 'id' to play nicely with backbone (Go's JSON needs Id be able to access it)
   // also adds support for collectionURLs to help with nested collections
   window.MealplannerModel = Backbone.Model.extend({
      // override parse, so that we can copy the "Id" to "id"
      //  Go has to use upper case and backbone needs lower case
      parse : function(response) {
         var attrs = Backbone.Model.prototype.parse.call(this, response);
         attrs.id = attrs.Id;
         this.setCollectionURLs(attrs.id);
         return attrs;
      },
      // method to set the URLs for nested collections once the id is available
      setCollectionURLs : function(id) {
         if (id && this.collectionURLs)
         {
            for(var name in this.collectionURLs) {
               var url = this.url();
               if (url.substr(-1) === "/") {
                  url += id;
               }
               this[name].url = url + "/" + this.collectionURLs[name] + "/";
            }
         }
      }
   });
   
   // Base "class" for collections, adding in the parsing logic to fix-up "Id" to be "id"
   //  add information to know if we've fetched before or not, and fetchOnce to only 
   //  fetch the first time
   window.MealplannerCollection = Backbone.Collection.extend({
      // override parse, so that we can copy the "Id" to "id"
      //  Go has to use upper case and backbone needs lower case
      parse : function(response) {
         var models = Backbone.Collection.prototype.parse.call(this, response);
         for (var m in models)
         {
            models[m].id = models[m].Id;
         }
         return models;
      },
      // override fetch so we track if we've called and completed fetch
      //  adds fetchCalled and fetched boolean members
      fetch : function(options) {
         if (this.url && ((!jQuery.isFunction(this.url)) || this.url())) {
            this.fetchCalled = true;
         } else {
            return;
         }
         options || (options = {});
         var success = options.success;
         options.success = function(m,r) {
            this.fetched = true;
            if (success) success(m, r);
         }.bind(this);
         return Backbone.Collection.prototype.fetch.call(this, options);
      },
      // fetch only if we haven't fetched before
      fetchOnce : function(options) {
         if (this.fetchCalled) {
            return;
         }
         return this.fetch(options);
      }
   });
   // model for user information
   window.User = MealplannerModel.extend({ });

   // model for UserList
   window.UserList = MealplannerCollection.extend({
      url: "/users",
      model: User
   })

   // simple model to represent a search
   window.Search = MealplannerModel.extend({
      defaults : {Rating: 0}
   });
   // model for Word (used for tags and keywords)
   window.Word = MealplannerModel.extend({
      defaults : {
         Word : ""
      }
   });
   // collection of words, including methods hasWord and getWord
   // to help search
   window.WordList = MealplannerCollection.extend({
      model: Word,
      comparator : function(mi) {
         return mi.get("Word");
      },
      hasWord : function( target ) {
         return this.any(function(w) {
               return w.get("Word") == target;
            });
      },
      getWord : function( target ) {
         return this.find(function(w) {
               return w.get("Word") == target;
            });
      }
   })
   // model of pairing, which has suggestions for two dishes
   //  will be the child of one dish, pointing to another -- Description
   //  is "Alternative" or "Recommended"
   window.Pairing = MealplannerModel.extend({
      defaults : {
         Other : "",
			Description : ""
      }
   });
   window.PairingList = MealplannerCollection.extend({
      model: Pairing
   })
   // children of a dish that link to ingredients, including amount and instructions
   window.MeasuredIngredient = MealplannerModel.extend({
      defaults : {
         Ingredient : "",
         Amount : "",
         Instruction : "",
         Order : 0
      }
   });
   window.MeasuredIngredientList = MealplannerCollection.extend({
      model: MeasuredIngredient,
      comparator : function(mi) {
         return mi.get("Order");
      },
   })
   // dish, which includes collections of tags, pairings and measured ingredients
   window.Dish = MealplannerModel.extend({
      // list the nested collections so they can have their URL's set
      collectionURLs : {
         "ingredients" : "mi",
         "tags" : "tags",
         "pairings" : "pairing"
      },
      defaults : function() { return {
         Name : "<New Dish>",
         DishType : "",
         Tags : [],
         PrepTimeMinutes : 0,
         CookTimeMinutes : 0,
         Rating : 0,
         Source : "",
         Text : "",
         ServingsCarb : 0,
         ServingsProtein : 0,
         ServingsVeggies : 0
       };
      },
      initialize: function() {
         this.ingredients = new MeasuredIngredientList;
         this.tags = new WordList;
			this.pairings = new PairingList;
         this.setCollectionURLs(this.id);
      },
      validate: function(attrs) {
         if (attrs.Name && attrs.Name.length == 0)
            return "Must give your dish a name";
         if (attrs.PrepTimeMinutes != undefined
               && isNaN(attrs.PrepTimeMinutes))
            return "Must give prep time in minutes";
         if (attrs.CookTimeMinutes != undefined
               && isNaN(attrs.CookTimeMinutes))
            return "Must give cook time in minutes";
      }
   });
   window.DishList = MealplannerCollection.extend({
      url: "/dish/",
      model: Dish,
      comparator : function(dish) {
         return dish.get("Name");
      },
      // helper method to get all DishTypes used to help with autocomplete
      allDishTypes : function() {
         var map = { Entree:1,Side:1,Appetizer:1,Dessert:1,Drink:1};
         this.each(function(d) {
            map[d.get("DishType")] = true;
         });
         var list = [];
         for (var i in map) {
            list.push(i);
         }
         return list.sort();
      },
      // helper method to get a list of all dishes for autocomplete
      allDishNames : function() {
         var list = [];
         this.each(function(d) {
            list.push(d.get("Name"));
         });
         return list.sort();
      },
      // helper method to find a dish using its name
      getDishByName : function(name) {
         var dish = null;
         return this.find(function(d) {
            return d.get("Name") == name;
         });
      }
   })
   // Model for ingredient
   window.Ingredient = MealplannerModel.extend({
      // register sub-collection of tags to keep URL updated
      collectionURLs : {
         "tags" : "tags"
      },
      defaults : function() { return {
         Name : "<New Ingredient>",
         Category : "",
         Source : "Vegan",
         Tags : [] };
      },
      initialize: function() {
         this.tags = new WordList;
         this.setCollectionURLs(this.id);
      },
      validate: function(attrs) {
         if (attrs.Name && attrs.Name.length == 0)
            return "Must give your ingredient a name";
      }
   });
   window.IngredientList = MealplannerCollection.extend({
      url: "/ingredient/",
      model: Ingredient,
      comparator : function(ingredient) {
         return ingredient.get("Name");
      },
      // return a list of all distinct categories for autocomplete
      allCategories : function() {
         var map = { Carbohydrate : true, Protein : true, Vegetable : true, Fruit : true, Sweet : true, Spice : true, Fat: true, Herb: true};
         this.each(function(ing) {
            map[ing.get("Category")] = true;
         });
         var categories = [];
         for (var cat in map) {
            categories.push(cat);
         }
         return categories.sort();
      }
   })
   // Model of menu, which lists dishes
   window.Menu = MealplannerModel.extend({
      defaults : {
			Name : "<New Menu>",
         Dishes : []
      },
      // helper method to know if menu lists the given dish
      // dish: Dish model
      hasDish : function (dish) {
         var dishes = this.get("Dishes");
         for(var d in dishes) {
            if (dishes[d] == dish.id)
               return true;
         }
         return false;
      },
      // helper method to remove the specified dish
      removeDish : function (dish) {
         var dishes = this.get("Dishes");
         dishes = _.reject(dishes, function(id) {
            return id == dish.id
         });
         this.save({Dishes:dishes});
      }
   });
   window.MenuList = MealplannerCollection.extend({
      url: "/menu/",
      model: Menu,
      // returns the "<New Menu>" menu which can't be deleted
      // creates one if it doesn't exist yet
      getDraftMenu : function() {
         if (this.draft)
            return this.draft;
         var self = this;
         this.each(function(menu) {
            if (menu.get("Name") == "<New Menu>") {
               self.draft = menu;
            }
         });
         if (!this.draft)
            return this.create({Name:"<New Menu>"});
         return this.draft;
      }
   })
   // base "class" for mealplanner views, includes common methods used by many views
   window.MealplannerView = Backbone.View.extend({
      // setup common event mappings for showing details when hovering
      //  and tracking changes
      events : {
         "mouseover .dish" : "onEnterDish",
         "mouseleave .dish" : "onHoverLeave",
         "click .dish" : "onHoverLeave",
         "mouseover .ingredient" : "onEnterIngredient",
         "mouseleave .ingredient" : "onHoverLeave",
         "click .ingredient" : "onHoverLeave",
         "change input" : "onChange",
         "autocompletechange input" : "onChange"
      },
      initialize : function() {
         // always use jQuery object for el
         this.el = $(this.el);
         // keep track if we're "dirty" -- meaning we have made changes
         //  that need to be saved to the server
         this.dirty = 0;
         // bind methods so we can pass them out and calls come back with our 'this'
         _.bindAll(this, "render");
         _.bindAll(this, "onChange");
         _.bindAll(this, "save");
         _.bindAll(this, "saveSuccess");
         _.bindAll(this, "saveError");
         _.bindAll(this, "del");
         _.bindAll(this, "newPairingDrop");
         _.bindAll(this, "newPairing");
         _.bindAll(this, "addPairingEvent");
         // bind to the model so we'll re-render and show errors
         this.model.bind('error', this.saveError);
         this.model.bind('all', this.render);
      },
      // create our basic layout:
      // <div class='title'>
      //   [icon] <span class='name'></span> <span class='buttons'></span>
      // </div>
      // <div class='fields'>
      // </div>
      // creates members: $title, $name, $buttons, $fields
      // uses: options.readOnly, options.buttons
      createBasicView : function () {
         this.$title = $.make("div", {"class":"title"})
            .appendTo(this.el);
         if (this.icon) {
            $.makeIcon(this.icon, true)
               .appendTo(this.$title);
         }
         this.$name = $.make("span", {"class":"name"})
            .appendTo(this.$title);
         this.$title.append(" ");
         if (this.buttons && !this.options.readOnly) {
            this.$buttons = $.make("span", {"class":"buttons"})
               .appendTo(this.$title);
            for (var b in this.buttons) {
               var info = this.buttons[b];
               $.make("button", {value:info.label, title:info.title}, info.label)
                  .button({icons:info.icons})
                  .click(this[info.click])
                  .appendTo(this.$buttons);
   
            }
            this.$buttons.buttonset();
            // makeup for a defect in jquery ui putting rounded
            //  edges on the wrong sides
            this.$buttons.children().first()
               .removeClass("ui-corner-right")
               .addClass("ui-corner-left");
            this.$buttons.children().last()
               .removeClass("ui-corner-left")
               .addClass("ui-corner-right");
         }
         this.$fields = $.make("div", {"class":"fields"})
            .appendTo(this.el);
      },
      // Add a new field to the $fields section
      //  adds <span class='field-head'>[name]</span> [separator] [icon]
      // returns jQuery object
      newField : function(name, icon, separator) {
         separator = separator || ": ";
         var $field = $.make("div", {"class": "field" } )
            .appendTo(this.$fields);
         if (name) {
            $.make("span", {"class": "field-head"})
               .text(name)
               .appendTo($field);
            $field.append(separator);
         }
         if (icon) {
            $.makeIcon(icon)
               .appendTo($field);
         }
         return $field;
      },
      // Add a new rating field with stars to the $fields section
      // returns jQuery object referencing the 5 star icons
      newRatingField : function (separator) {
         var $starField = this.newField("Rating", null, separator);
         for (var i = 0; i < 5; i++)
         {
            var self = this;
            var $star = $("<span class='ui-icon ui-icon-star rating'></span>")
               .appendTo($starField);
				// add a click handler to set the rating when they click
				//  on a star
				if (!this.options.readOnly) {
            	(function (rating) {
               	$star.click(function() {
                     	var newRating = rating;
                     	// if they click the star for the current rating,
                     	//  reset to none
                     	if (newRating == self.model.get("Rating")) {
                        	newRating = 0;
                     	}
                        if (self.$save && self.onChange) {
                           self.model.set({"Rating": newRating});
                           self.onChange();
                        } else {
                           try {
                              self.model.save({"Rating": newRating});
                           } catch(e) {
                              self.model.set({"Rating": newRating});
                           }
                        }
                  	})
            	}) (i+1);
				}
         }
         return $starField.find(".ui-icon-star");
      },
      // adds a new Tags field to the $fields section including
      // edit box wired up to the parseTags method to add tags
      // creates $tags element for the list of tags, used by renderTags method
      newTagsEditField : function() {
         var self = this;
         var $tagField = this.newField("Tags", "ui-icon-tag");
         this.$tags = $("<span class='tag-list'></span>")
            .appendTo($tagField);
         $tagField.append("<br/>Type new tags, separated by commas<br/>");
         this.$newTags = $("<input type='text'></input>")
            .bind('keypress', function (evt) {
               if (evt.which == 13) {
                  evt.preventDefault();
                  self.parseTags()
               }
            })
            .textInput()
            .appendTo($tagField);
         return $tagField;
      },
      // creates the common layout for editing, similar structure to view,
      //  $name is replaced with a text edit box, and the $error section is 
      //  added for showing errors
      createEditView : function () {
         this.createBasicView();
         var $oldName = this.$name;
         this.$name = $("<input class='name' type='text'></input>")
            .textInput();
         $oldName.replaceWith(this.$name);
         this.$error = $("<div class='error'></div>")
                        .hide();
         this.$title.after(this.$error);
      },
      // method to handle changes made on the ui, sets a timer to save
      //  sets the dirty flag, and calls setModels method so UI data
      //  can be written to the model
      onChange : function() {
         if (this.$save == undefined) return;
         this.dirty++;
         // hide the error display, now that we might save again
         this.$error.hide();
         // write changes to the model
         this.setModels();
         // display the save button, set a timer to do the save
         if (this.$error == undefined || this.$error.is(":hidden")) {
            this.$save.button({disabled : false, label: "Save"}); 
            this.saveTimeout = setTimeout(this.save, 5000);
         }
      },
      // method to delete the model, uses a common setting for a "are you sure" dialog
      del : function() {
         var self = this;
         if (window.SuppressAreYouSure) {
            this.model.destroy();
            this.remove();
            return;
         }
         var $dialog = $.make("div", "<p></p><p><input type='checkbox' name='suppress' checked class='ui-widget'></input> Always ask me before deleting.</p>")
            .appendTo(document.body);
         $dialog.find("p").first()
            .text("You will permanently delete '" + this.model.get("Name") + "'.");
         $dialog.find("input")
            .change(function() {
               window.SuppressAreYouSure = !this.checked;
            });
         $dialog
            .dialog({
               modal : true,
               title : "Are you sure?",
               buttons : {
                  Yes : function() {
                     self.model.destroy();
                     self.remove();
					      $(this).dialog("close");
                  },
                  No : function() {
					      $(this).dialog("close");
                  }
               }
            })
      },
      // save the changes if there are any
      save : function() {
         if (this.dirty) {
            if (this.model.url == undefined)
               return;
            this.dirty = 1;
            if (this.$save)
               this.$save.button({disabled : true, text : "Saving"}); 
            this.model.save({},
               {
                  error : this.saveError,
                  success : this.saveSuccess
               });
         }
         else if (this.$error.is(":hidden"))
         {
            this.dirty = 1;
            this.saveSuccess()
         }
      },
      // handle a failure to save
      saveError : function(model, response) {
         this.dirty = 0;
         if (this.$save) {
            this.$save.button({disabled : true, label : "Save Failed"}); 
         }
         if (this.$error) {
            this.$error.text("Error: " + response);
            this.$error.show();
         }
      },
      // handle a successful save
      saveSuccess : function(model, response) {
         this.dirty--;
         if (this.$error) {
            this.$error.hide();
         }
         if (this.$save) {
            if (this.dirty > 0) {
               this.$save.button({disabled : false, label : "Save"}); 
            } else {
               this.$save.button({disabled : true, label : "Saved"}); 
            }
         }
      },
      // event handler when a "hoverable" item has the mouse enter
      //  set a timer, so that in time we'll pop-up the detail view
      //  of that item
      onHoverEnter : function(evt, viewCtor) {
         var target = evt.currentTarget;
         // check if this item has a model to give us data
         if (target && target.model) {
            // check if we're already preparing a hover view
            if (target.$hoverView)
               return false;
            target.$hoverView = $.make("div").hide();
            // delay showing for a second after hovering starts
            setTimeout(function() {
               var $hoverView = target.$hoverView;
               if ($hoverView && $hoverView.is(":hidden")) {
                  var view = new viewCtor({ el : target.$hoverView,
                                          model: target.model,
                                          readOnly: true});
                  view.render();
                  var $target = $(target);
                  var pos = $target.offset();
                  pos.top = pos.top + $target.height() + 2;
                  pos.right = $(window).width() - (pos.left + $target.width());
                  target.$hoverView
                     .hoverView(pos)
                     .hide()
                     .appendTo(document.body);
                  // after the timeout, show it, and add a delay so
                  //  it will not be hidden immediately after appearing
                  $hoverView
                     .click( function() {
                        $hoverView.hide(0, function() {
                           $hoverView.remove();
                        });
                     })
                     .show('blind')
                     .delay(100);
                  // catch the case of ophans, and remove them -- somehow
                  //  we can fail to get the mouse leave event
                  setTimeout(function() {
                     $hoverView.hide(0, function() {
                           $hoverView.remove();
                        });
                     }, 20000);
                }
            }, 1000);
         }
         return false;
      },
      // event handler to counter onHoverEnter, which hides/disables hover view
      //  when the mouse leaves the element
      onHoverLeave : function (evt, ui) {
         var target = evt.currentTarget;
         if (target && target.$hoverView) {
            var $hoverView = target.$hoverView;
            target.$hoverView = null;
            // hide the view, and remove it when done
            //  if we remove it right away, we may be interrupting
            //  the animation when showing, the hide gets queued behind
            //  the animation
            $hoverView.hide(0, function() {
               $hoverView.remove();
            });
         }
      },
      onEnterDish : function (evt) {
         return this.onHoverEnter(evt, DishView);
      },
      onEnterIngredient : function (evt) {
         return this.onHoverEnter(evt, IngredientView);
      },
      // take the comma separated values in the $newTags field
      // and add them to the model.tags collection
      parseTags : function () {
            var newTags = this.$newTags.val();
            if (newTags.length == 0)
               return
            this.$newTags.val("");
            var quote = -1;
            var c = 0;
            var nextTag = ""
            var curTags = {};
            var self = this;
            var createTag;
            if (this.model.tags) {
               createTag  = function(tag) {
                  self.model.tags.create({Word:tag});
               }
               this.model.tags.each(function(tag) {
                  var w = tag.get("Word");
                  curTags[w] = w;
               })
            } else {
               createTag = function(tag) {
                  var tags = self.model.get("Tags");
                  if (!tags) tags = [];
                  else tags = tags.slice(0);
                  tags.push(tag)
                  self.model.set({Tags: tags});
               }
               var tags = self.model.get("Tags");
               _.each(tags, function(tag) {
                  curTags[tag] = tag;
               });
            }
            while (c < newTags.length)
            {
               if (quote >= 0)
               {
                  if (newTags[c] == '"')
                  {
                     if (nextTag.length > 0)
                     {
                        if (! (nextTag in curTags)) {
                           createTag(nextTag);
                        }
                        nextTag = "";
                     }
                     quote = -1;
                  }
                  else
                  {
                     nextTag += newTags[c];
                  }
               }
               else if (newTags[c] == "," || newTags[c] == "\r" || newTags[c] == "\n" || newTags[c] == "\t")
               {
                  if (nextTag.length > 0)
                  {
                     if (! (nextTag in curTags)) {
                        createTag(nextTag);
                     }
                     nextTag = "";
                  }
               }
               else if (newTags[c] == '"') {
                  quote = c;
               }
               else if (newTags[c] == " ") {
                  if (nextTag.length > 0)
                     nextTag += " ";
               }
               else
               {
                  nextTag += newTags[c];
               }
               c++;
            }
            if (nextTag.length > 0)
               if (! (nextTag in curTags)) {
                  createTag(nextTag);
               }
      },
      // render the tags from the tags collection in the $tags element
      renderTags : function () {
			var self = this;
         var $tags = this.$tags;
         var tags = this.model.tags;
         $tags.html("");
         if ((!tags) || tags.length == 0)
            $tags.append("[none]");
         tags.each(function(tag, t) {
            if (t > 0)
               $tags.append(", ");
            var $tag = $("<div class='tag'></div>")
               .appendTo($tags);
            var $text = $("<a></a>")
               .appendTo($tag)
               .text(tag.get("Word"))
               .attr("href", "#search/" + tag.get("Word") + "//");
				if (!self.options.readOnly) {
            	var $delTag = $.makeRemoveIcon()
               	.appendTo($tag)
               	.click(function () {
                     	tag.destroy();
                  	})
               	.autoHide({handle:$tag});
				}
         });
      },
      // handle the event triggering a pairing to be added from input box
      addPairingEvent: function(e, ui) {
         var dishName = "";
         if (ui && ui.item) {
            dishName = ui.item.value;
         }
         if (dishName.length > 0) {
            var dish = Dishes.getDishByName(dishName);
            if (dish) {
               this.newPairing(dish);
               $(this).val("");
            }
         }
         e.returnValue = "";
         return false;
      },
      // initialize the view that displays pairings
      // sets up the drop target from drag-drop and 
      //  the autocompleted form for typing in the other dish name
      initPairings: function() {
         var $sugField = this.newField("Suggestions");
         this.$pairings = $("<div class='pairing-list'></div>")
            .appendTo($sugField);
			this.$pairingsDrop = $("<div class='dish-drop ui-widget-content'>Drag dishes here to add a suggestion<br/> or type the dish name below.<br></div>")
				.appendTo($sugField);
         this.el
				.droppable({
					accept: ".dish",
					hoverClass : "ui-state-highlight drop-accept",
					drop: this.newPairingDrop
				});
         
         var self = this;
         $("<input type='text'>")
            .appendTo(this.$pairingsDrop)
            .textInput()
            .combo({source:Dishes.allDishNames()})
            .bind('change', this.addPairingEvent)
            .bind('autocompletechange', this.addPairingEvent)
            .bind('autocompleteselect', this.addPairingEvent)
            .bind('keypress', function (evt) {
               if (evt.which == 13) {
                  evt.preventDefault();
                  if ($(this).val().length > 0) {
                     var dish = Dishes.getDishByName($(this).val());
                     if (dish) {
                        self.newPairing(dish);
                        $(this).val("");
                     }
                  }
               }
            });
         if (this.options.readOnly) {
            this.$pairingsDrop.hide();
         }
      },
      // render each pairing, uses a grouping by "Description"
      //  also renders menus that include the dish
      renderPairings: function () {
         // start by collecting all of the pairings, grouped by the description
         var $pairings = this.$pairings;
         var pairings = this.model.pairings;
         var collection = window.Dishes;
         $pairings.html("");
		   var map = {};
         pairings.each(function(pairing, t) {
			   var desc = pairing.get("Description");
			   if (!(desc in map))
				   map[desc] = []
			   var item = collection.get(pairing.get("Other"));
			   if (item)
				   map[desc].push({other: item, pairing: pairing});
		   });
         // loop through the descriptions adding each
			var self = this;
         _.each(map, function(list, desc) {
			   $.make("div")
               .addClass("pairing-head")
				   .text(desc)
				   .appendTo($pairings);
            // loop through each item and add it to a list
			   var $ul = $.make("ul")
               .addClass("pairing-list")
				   .appendTo($pairings);
			   _.each(list, function(pairing, p) {
         	   var $pairing = $.make("li", {"class":"pairing dish"})
                  .append($.makeIcon('ui-icon-dish'))
            	   .appendTo($ul);
               $pairing[0].model = pairing.other;
         	   $.make("a")
            	   .appendTo($pairing)
            	   .text(pairing.other.get("Name"))
            	   .attr("href", "#viewDish/" + pairing.other.id);
					if(!self.options.readOnly) {
         	   	var $delTag = $.makeRemoveIcon()
            	   	.appendTo($pairing)
            	   	.click(function () {
                  	   	pairing.pairing.destroy();
                  	})
                  	.autoHide({handle:$pairing});
					}
			   });
         });
         // add the menus
         var dishId = this.model.id;
         var menus = Menus.filter(function(menu) {
            return _.indexOf(menu.get("Dishes"), dishId) != -1;
         });
         if (menus.length > 0) {
			   $.make("div")
               .addClass("pairing-head")
				   .text("Menus")
				   .appendTo($pairings);
			   var $ul = $.make("ul")
               .addClass("pairing-list")
				   .appendTo($pairings);
            _.each(menus, function(menu) {
         	   var $pairing = $.make("li", {"class": "pairing"})
                  .append($.makeIcon("ui-icon-menu"))
            	   .appendTo($ul);
               $pairing[0].model = menu;
         	   $.make("a")
            	   .appendTo($pairing)
            	   .text(menu.get("Name"))
            	   .attr("href", "#viewMenu/" + menu.id);
            });
         }
      },
      // add a new pairing
	   addPairing : function (desc, other) {
		   this.model.pairings.create({Other : other.id, Description : desc });
	   },
      // event handler called when a pair-able item is dropped
	   newPairingDrop : function (evt, ui) {
         return this.newPairing(ui.draggable[0].model);
      },
      // method to start dialog that prompts to add a new pairing
	   newPairing : function (other) {
		   var self = this;
         // create a dialog with the names and buttos to pick the description
		   var $dialog =$("<div></div>").appendTo(document.body);
		   $dialog.text("For " + self.model.get("Name") + " and " + other.get("Name") + "?")
		   $dialog.dialog({
			   title : "What kind of suggestion?",
			   modal: true,
			   buttons : {
				   Together : function() {
					   self.addPairing("Together", other);
					   $(this).dialog("close");
				   },
				   Alternative : function() {
					   self.addPairing("Alternative", other);
					   $(this).dialog("close");
				   },
				   Cancel : function() {
					   $(this).dialog("close");
				   }
			   }
		   });
	   },
      // render a list of items, using the specified css class, the root of the
      //  link to view it, and the plural of the item in english
      // used by the list views
      //  uses options.searchResults to filter the results
      // assumes this.model is a collection
      renderItemNameList : function (cssclass, viewLink, englishPlural) {
         // remove existing html
         this.el.children().remove();
         var self = this;
         // create the filtered list of items, either all items of only those
         // the search results have
         var filtered;
         if (this.options.searchResults != undefined) {
            var results = this.options.searchResults;
            var minRating = this.options.minRating || 0;
         
            filtered = this.model.filter(function(item) {
                  var rating = item.get("Rating") || 0;
                  return (item.id in results) && rating >= minRating;
               });
            filtered = _.sortBy(filtered, function(item) {
                  var key = $.zfill(9999 - results[item.id], 4);
                  return key + item.get("Name");
               });
         } else {
            filtered = this.model.toArray();
         }
            
         // loop through each item adding it to the list, using a table so that the
         // if the text wraps, the icon stays in line with the first line and
         //  the second line doen's flow to the left below the icon
         _.each(filtered, function(item, idx) {
            var $li = $("<li><table class='li'><tr><td><span class='ui-icon inline ui-icon-"+cssclass+"'></span></td><td></td></tr></li>")
               .appendTo(self.el)
               .addClass(cssclass)
				   .draggable({revert:true,helper:'clone',appendTo:'body'});
            var $td = $li.find("td").eq(1);
            var name = item.get("Name");
            $("<a></a>")
                  .appendTo($td)
                  .text(name)
                  .attr("href", "#" + viewLink + "/" + item.id);
            var rating = item.get("Rating");
            if (rating && rating > 0) {
               $td.append("<span class='summary'><span class='ui-icon ui-icon-star rating count'></span>"+rating+"</span>");
            }
			   $li[0].model = item;
         });
         if (filtered.length == 0) {
            var $li = $("<li>[No "+englishPlural+"]</li>")
               .appendTo(this.el)
         }
         return this;
      },
      // draw the nutritional balance chart using the google chart API
      // NOTE: the $dest must be rooted in the document tree when this function
      // is called
      drawChart : function ($dest, title, veggies, protein, carbs) {
         var data = new google.visualization.DataTable();
         // add the data
         data.addColumn('string', 'Type');
         data.addColumn('number', 'Servings');
         data.addRows(3);
         data.setValue(0,0, 'Fruits/Veggies');
         data.setValue(0,1, veggies);
         data.setValue(1,0, 'Protein');
         data.setValue(1,1, protein);
         data.setValue(2,0, 'Carbohydrates');
         data.setValue(2,1, carbs);
         var chart = new google.visualization.PieChart($dest[0]);
         // draw the chart
         chart.draw(data, {width: 100, height: 100, legend:'none',
            title : title, fontSize : 10, 
            colors : ["#459E00", "#B23500", "#770071"]});
      }, 
      // handle cloning, popup a dialog to take the new name
      //  
      cloneMenu : function() {
         var self = this;
         var $dialog = $("<div><input type='text'></input></div>");
         var save = function() {
            var $input = $dialog.find("input");
            if ($input.val().length > 0 &&
                $input.val() != "<New Menu>")
            {
               var newAttrs = {Name:$input.val(),
                  Dishes:self.model.get("Dishes")};
               var newMenu = Menus.create(newAttrs, {
                  success : function(model, resp, shr) {
                     $dialog.dialog("close");
                     App.viewMenu(newMenu);
                     if (self.model == Menus.getDraftMenu()) {
                        // empty the draft menu
                        self.model.save({Dishes: [] });
                     }
                  }});
            }
         }
         $dialog.appendTo(this.el)
            .dialog({
               modal: true,
               title: "Menu Name?",
               buttons : {
                  Save : save,
                  Cancel : function() {
					      $(this).dialog("close");
                  }
               }});
         $dialog.find("input")
            .textInput({size:30})
            .bind('keypress', function (evt) {
               if (evt.which == 13) {
                  evt.preventDefault();
                  save();
               }
            });
      }
   });
   // dish list view, simply uses renderItemNameList
   window.DishListView = window.MealplannerView.extend({
      tagName : "ul",
      className : "dish-list",
      render : function() {
         this.renderItemNameList("dish", "viewDish", "dishes");
         return this;
      }
   })
   // ingredient list view, simply uses renderItemNameList
   window.IngredientListView = window.MealplannerView.extend({
      tagName : "ul",
      className : "ingredient-list",
      render : function() {
         this.renderItemNameList("ingredient", "viewIngredient", "ingredients");
         return this;
      },
   })
   // simple view to show a dish
   window.DishView = window.MealplannerView.extend({
      tagName : "div",
      className : "dish-view",
      icon: "ui-icon-dish",
      buttons : [
         {label:"Edit", title: "Edit This Dish", click: "edit" },
         {label:"Delete", title: "Delete This Dish", click: "del" },
      ],
      initialize: function() {
         var self = this;
         this.$vegIcon = null;
         // call the initialize from the base "class"
         MealplannerView.prototype.initialize.call(this);
         // bind the callback
         _.bindAll(this, "edit");
         // bind event handlers for the nested collections
         this.model.tags.bind('all', this.render);
         this.model.ingredients.bind('all', this.render);
         this.model.pairings.bind('all', this.render);
         this.model.ingredients.fetchOnce();
         this.model.tags.fetchOnce();
         // alway fetch pairings -- we don't always see them get added
         this.model.pairings.fetch();
         // create the skeleton view
         this.createBasicView();
         // add the rating field
         this.$stars = this.newRatingField();
         // add the text input fields
         this.$source = $("<span class='dish-source'></span>")
            .appendTo(this.newField("Source"));
         this.$type = $("<span class='dish-type'></span>")
            .appendTo(this.newField("Dish Type"));
         var $ptField = this.newField("Prep Time")
         this.$prepTime = $("<span class='dish-time'></span>")
            .appendTo($ptField);
         $ptField.append(" minutes")
         var $ctField = this.newField("Cook Time");
         this.$cookTime = $("<span class='dish-time'></span>")
            .appendTo($ctField);
         $ctField.append(" minutes")
   
         // add the "servings" views to track nutrition
         var $breakdown = $("<table class='breakdown'></table>")
            .appendTo(this.newField("Breakdown of a single serving"));
         var $tr = $("<tr><td>Fruits and Vegetables</td></tr>")
            .appendTo($breakdown);
         var $td = $("<td></td>")
            .appendTo($tr);

         this.veggies = new ServingView({model: this.model,
            field: "ServingsVeggies", el: $td});
         $tr = $("<tr><td>Protein</td></tr>")
            .appendTo($breakdown);
         $td = $("<td></td>")
            .appendTo($tr);
         this.proteins = new ServingView({model: this.model,
            field: "ServingsProtein", el: $td});
         $tr = $("<tr><td>Carbohydrates</td></tr>")
            .appendTo($breakdown);
         $td = $("<td></td>")
            .appendTo($tr);
         this.carbs = new ServingView({model: this.model,
            field: "ServingsCarb", el: $td});
         this.veggies.render()
         this.proteins.render()
         this.carbs.render()

         // create the tag view
         this.$tags = $("<span class='tag-list'></span>")
            .appendTo(this.newField("Tags", "ui-icon-tag"));
         // initialize the table to display measured ingredients
         this.$mi = $("<table class='ingredients'><tr><th>Ingredient</th><th>Amount</th><th>Notes</th><th></th></tr></table>")
            .appendTo(this.$fields);
         var allIngredients = Ingredients.map(
               function(i) { return i.get("Name"); });
         var $lastRow = $("<tr></tr>")
            .appendTo(this.$mi);
         // setup the pairings view
         this.initPairings();
         // create the general "text" field
         this.$text = $("<div class='text'></div>")
            .appendTo(this.newField("Text")); 
      },
      // populate the view with current data
      render : function() {
         var self = this;
         // check if this dish is vegan or vegetarian and show the proper icon
         if (this.$vegIcon == null && this.model.tags.fetched) {
            if (this.model.tags.hasWord("Vegan")) {
               this.$vegIcon = $("<img src='images/vegan_32.png' title='Vegan'></img>");
               this.$name.before(this.$vegIcon);
                  
            } else if (this.model.tags.hasWord("Vegetarian")) {
               this.$vegIcon = $("<img src='images/vegetarian_32.png' title='Vegetarian'></img>");
               this.$name.before(this.$vegIcon);
                  
            }
         }
         // populate the text fields
         this.$name.text(this.model.get("Name"));
         this.$type.text(this.model.get("DishType"));
         this.$prepTime.text(this.model.get("PrepTimeMinutes"));
         this.$cookTime.text(this.model.get("CookTimeMinutes"));
         // turn source into a hyperlink if it is a URL
         var source = this.model.get("Source");
         if (source.indexOf("http://") == 0 ||
            source.indexOf("https://") == 0)
         {
            this.$source.html("<a class='external' target='_blank' href='" + source + "'>" + source + "</a>");
         }
         else
         {
            this.$source.text(source);
         }
         // update the rating by highlighting stars
         var rating = this.model.get("Rating");
         for (var i = 0; i < 5; i ++)
         {
            if (rating >= (i+1))
               this.$stars.eq(i).removeClass("disabled");
            else
               this.$stars.eq(i).addClass("disabled");
         }
         // render the tags
         this.renderTags();
         // add the ingredients
         var self = this;
         this.$mi.find("tr.ingredient").remove();
         this.model.ingredients.each(function(i) {
               var $tr = $("<tr class='ingredient'></tr>");
               $tr.attr("id", i.id);
               var $name = $("<td></td>")
						.append($.makeIcon("ui-icon-ingredient"))
						.appendTo($tr);
               var $amount = $("<td><span class='ingredient-amount'></span></td>")
                  .appendTo($tr)
                  .find("span");
               var $instruction = $("<td><span class='ingredient-instruction'></span></td>")
                  .appendTo($tr)
                  .find("span");
               $amount.text(i.get("Amount"));
               $instruction.text(i.get("Instruction"));
               var ingredient = Ingredients.get(i.get("Ingredient"));
               if (ingredient) {
                  $tr[0].model = ingredient;
                  $("<a></a>")
                        .appendTo($name)
                        .text(ingredient.get("Name"))
                        .attr("href", "#viewIngredient/" + ingredient.id);
               } else {
                  $name.text("[missing]");
               }
               self.$mi.append($tr);
         });
         if (this.model.ingredients.length == 0) {
            this.$mi.append("<tr class='ingredient'><td>[none]</td></tr>");
         }
         // render the pairings
         this.renderPairings();
         // add the text, using createTextNode so we don't inject scripts or HTML or anything
         this.$text.html("");
         var lines = this.model.get("Text").split("\n");
         for (var l in lines) {
            var text = document.createTextNode(lines[l]);
            this.$text.append(text);
            this.$text.append("<br>");
         }
         return this;
      },
      // trigger the edit of the dish
      edit: function(ev) {
         this.trigger("editDish", this.model);
      },
   });
   // view for editing a dish
   window.DishEditView = window.MealplannerView.extend({
      tagName : "div",
      className : "dish-edit",
      icon : "ui-icon-dish",
      buttons : [
         {label:"Save", title: "Save this dish", click: "save" },
         {label:"Delete", title: "Delete this dish", click: "del" },
      ],
      initialize: function() {
         var self = this;
         // call base "class" initialize
         MealplannerView.prototype.initialize.call(this);
         // bind event handlers to this
         _.bindAll(this, "newPairingDrop");
         _.bindAll(this, "newPairing");
         // bind to nested collection model events
         this.model.ingredients.bind('all', this.render);
         this.model.tags.bind('all', this.render);
         this.model.pairings.bind('all', this.render);
         // fetch data
         this.model.ingredients.fetchOnce();
         this.model.tags.fetchOnce();
         // always fetch pairings, a given dish may not see one added
         this.model.pairings.fetch();
         // track the ingredients we know about so we only subit ones that 
         //  have changed
         this.ingredients = { gen : 0};
         // create the basic edit layout
         this.createEditView();
         //  grey-out Save button when already saved (hasChanged == false)
         this.$save = this.$title.find("button[value='Save']")
               .button("option", "disabled", true);
         // add rating field
         this.$stars = this.newRatingField();
         // add text edit fields
         this.$source = $("<input type='text'></input>")
            .textInput({size:50})
            .appendTo(this.newField("Source"));
         this.$type = $("<input type='text'></input>")
            .appendTo(this.newField("Dish Type"))
            .textInput()
            .combo({source:Dishes.allDishTypes()});
         var $ptField = this.newField("Prep Time")
         this.$prepTime = $("<input type='text'></input>")
            .textInput({size:4})
            .appendTo($ptField);
         $ptField.append(" minutes")
         var $ctField = this.newField("Cook Time");
         this.$cookTime = $("<input type='text'></input>")
            .textInput({size:4})
            .appendTo($ctField);
         $ctField.append(" minutes")
         // add controls to change serving counts
         var $breakdown = $("<table class='breakdown'></table>")
            .appendTo(this.newField("Breakdown of a single serving"));
         var $tr = $("<tr><td>Fruits and Vegetables</td></tr>")
            .appendTo($breakdown);
         var $td = $("<td></td>")
            .appendTo($tr);

         this.veggies = new ServingView({model: this.model,
            field: "ServingsVeggies", el: $td, onChange: this.onChange});
         $tr = $("<tr><td>Protein</td></tr>")
            .appendTo($breakdown);
         $td = $("<td></td>")
            .appendTo($tr);
         this.proteins = new ServingView({model: this.model,
            field: "ServingsProtein", el: $td, onChange: this.onChange});
         $tr = $("<tr><td>Carbohydrates</td></tr>")
            .appendTo($breakdown);
         $td = $("<td></td>")
            .appendTo($tr);
         this.carbs = new ServingView({model: this.model,
            field: "ServingsCarb", el: $td, onChange: this.onChange});
         this.veggies.render()
         this.proteins.render()
         this.carbs.render()
         
         // add field to add new tags
         this.newTagsEditField();
         this.$mi = $("<table class='ingredients'><tr><th>Ingredient</th><th>Amount</th><th>Notes</th><th></th></tr></table>")
            .appendTo(this.newField("Ingredients [Amount, extra instructions (chopped, peeled, etc.)]"));
         var allIngredients = Ingredients.map(
               function(i) { return i.get("Name"); });
         var $lastRow = $("<tr></tr>")
            .appendTo(this.$mi);
         var $addCell = $("<td colspan=3>")
            .appendTo($lastRow);
         this.$addIngredient = $("<input type='text'></input>")
            .appendTo($addCell)
            .combo({source: allIngredients})
            .bind('keypress', function (evt) {
               if (evt.which == 13) {
                  evt.preventDefault();
                  self.addIngredient(false)
               }
            })

         // initialize the view of parings
         this.initPairings();
         // add the text edit field
         this.$text = $("<textarea cols='50' rows='10'></textarea>")
            .appendTo(this.newField("Text"))
            .change(this.onChange);
         this.$text.before("<br/>");
            
         // if we don't have an id for the model yet, save to the server
         if (!this.model.id)
            this.save();
      },
      // update the view with current data
      render : function() {
         var self = this;
         // enable the Save button if something has changed
         if (this.dirty) {
            this.$save.button({disabled : false, label: "Save"}); 
         }
         // populate the text edit boxes
         this.$name.val(this.model.get("Name"));
         this.$type.val(this.model.get("DishType"));
         this.$prepTime.val(this.model.get("PrepTimeMinutes"));
         this.$cookTime.val(this.model.get("CookTimeMinutes"));
         this.$source.val(this.model.get("Source"));
         // update the stars for the rating
         var rating = this.model.get("Rating");
         for (var i = 0; i < 5; i ++)
         {
            if (rating >= (i+1))
               this.$stars.eq(i).removeClass("disabled");
            else
               this.$stars.eq(i).addClass("disabled");
         }
         var self = this;
         // display current tags
         this.renderTags();
         // increment our 'generation' of ingredients 
         //  walk the current ingredients, and mark in our dictionary
         //  if they're present
         // any that have an older generation after this are to be removed
         // from the view
         //  any not in our dictionary are new and should be added
         this.ingredients.gen++;
         var nextIngredients = {};
         var animal = false;
         var vegetarian = false;
         var vegan = false;
         this.model.ingredients.each(function(i) {
            var changed = false;
            var ing;
            var ingredient = Ingredients.get(i.get("Ingredient"));
            if (ingredient) {
               switch (ingredient.get("Source")) {
               case "Vegan":
                  vegan = true;
                  break;
               case "Vegetarian":
                  vegetarian = true;
                  break;
               default:
                  animal = true;
                  break;
               }
            }
            if (i.id in self.ingredients)
            {
               ing =  self.ingredients[i.id];
               if (ing.Amount != i.get("Amount")
                    || ing.Instruction != i.get("Instruction"))
               {
                  changed = true;
               }
               ing.gen = self.ingredients.gen;
            }
            else
            {
               changed = true;
      
               ing = { Amount : i.get("Amount"), Instruction : i.get("Instruction"), gen : self.ingredients.gen};
               var $tr = $("<tr class='ingredient'></tr>");
               ing.$tr = $tr;
               self.$mi.find("tr").last().before($tr);
               $tr.attr("id", i.id);
               ing.$name = $("<td></td>").appendTo($tr);
               ing.$amount = $("<td><input type='text'></input></td>")
                  .appendTo($tr)
                  .find("input")
                  .textInput();
               ing.$instruction = $("<td><input type='text'></input></td>")
                  .appendTo($tr)
                  .find("input")
                  .textInput();
               ing.$del = $("<td></td>")
                  .append($.makeRemoveIcon())
                  .appendTo($tr)
                  .click(function() {
                     var $tr = $(this).closest("tr");
                     var mi  = self.model.ingredients.get($tr.attr("id"));
                     mi.destroy();
                     });
               if (self.addedIngredient) {
                  self.addedIngredient = false;
                  ing.$amount.focus();
               }
               self.ingredients[i.id] = ing;
            }
            if (changed) {
               ing.$amount.val(i.get("Amount"));
               ing.$instruction.val(i.get("Instruction"));
               if (ingredient) {
                  ing.$name.text(ingredient.get("Name"));
               } else {
                  ing.$name.text("[missing]");
               }
            }
         });
         var remove = [];
         for (var i in this.ingredients) {
            if ( i != "gen" && this.ingredients[i].gen != this.ingredients.gen)
            {
               this.ingredients[i].$tr.remove();
               remove.push(i);
            }
         }
         for (var r in remove) {
            delete this.ingredients[remove[r]];
         }
         // update the tags for Vegan and Vegetarian
         if (animal) {
            this.updateVegTags(0);
         } else if (vegetarian) {
            this.updateVegTags(1);
         } else {
            this.updateVegTags(2);
         }
         // update the pairings
         this.renderPairings();
         // update the text edit box
         this.$text.val(this.model.get("Text"));
         return this;
      },
      // add/remove tags based on the ingredients 0 = none, 1 = Vegetarian only
      // 2 = Vegan & Vegetarian
      updateVegTags : function(which) {
         // only update if we have fetched tags
         if (!this.model.tags.fetched) return;
         // if we already have the right tags, skip
         if (this.createdVegTags == which) return;
         this.createdVegTags = which;
         // look for each tag, and add/remove if we found it or not
         var veganTag = this.model.tags.getWord("Vegan");
         var vegetarianTag = this.model.tags.getWord("Vegetarian");
         switch(which) {
            case 0:
               if (veganTag) { veganTag.destroy(); }
               if (vegetarianTag) { vegetarianTag.destroy(); }
               break;
            case 1:
               if (veganTag) { veganTag.destroy(); }
               if (!vegetarianTag) {
                  this.model.tags.create({Word:"Vegetarian"});
               }
               break;
            case 2:
               if (!vegetarianTag) {
                  this.model.tags.create({Word:"Vegetarian"});
               }
               if (!veganTag) {
                  this.model.tags.create({Word:"Vegan"});
               }
               break;
         }
      },
      // when we receive focus, focus on the name
      focus : function() {
         this.$name.focus();
      },
      // copy data from the view into the model
      setModels : function() {
         this.model.set({"Name": this.$name.val(),
            "DishType": this.$type.val(),
            "PrepTimeMinutes": parseInt(this.$prepTime.val()),
            "CookTimeMinutes": parseInt(this.$cookTime.val()),
            "Source": this.$source.val(),
            "Text" : this.$text.val()
            });
         var $trs = this.$mi.find("tr.ingredient");
         for (var i = 0; i < $trs.length; i++)
         {
            var $tr = $($trs[i]);
            var id = $tr.attr("id");
            var model = this.model.ingredients.get(id);
            var $amount = $tr.find("input").eq(0);
            var $instruction = $tr.find("input").eq(1);
            if (model.get("Amount") != $amount.val()
               || model.get("Instruction") != $instruction.val())
            {
               model.save({"Amount" : $amount.val(),
                           "Instruction" : $instruction.val()},
                           { error: this.saveError });
            }
         }
         this.parseTags();
         this.addIngredient(true);
      },
      // add any ingredients that have been typed in
      // if the typed ingredient doesn't exist, popup a dialog to create it
      addIngredient : function(fromChangeHandler) {
         // skip this if we have an add dialog up
         if (this.$addDialog) return;
         if (this.$addIngredient.val()) {
            var newName = this.$addIngredient.val();
            var key = null;
            Ingredients.each(function(i) {
               if (i.get("Name") == newName) {
                  key = i.id;
               }
            });
            if (key) {
               this.$addIngredient.val("");
               this.addedIngredient = true;
               this.model.ingredients.create({
                     Ingredient : key,
                     Order : this.model.ingredients.length
                  });
               if (!fromChangeHandler)
                  this.onChange();
            } else {
               var self = this;
               var $dialog = $.make("div")
                  .appendTo(document.body);
               this.$addDialog = $dialog;
               var newIngredient = Ingredients.create({Name:newName });
               var ingredientEdit = new IngredientEditView({
                     model:newIngredient,
                     el: $dialog })
                  .render();
               $dialog.find("button[value='Delete']").hide();
               $dialog.find("button[value='Save']").hide();
               $dialog.dialog({
                  modal: true,
                  title: "Create New Ingredient '" + $("<div>").text(newName).html() + "'?",
                  width: self.$title.width(),
                  close : function () {
                     self.$addDialog = null;
                     if (newIngredient) {
                        newIngredient.destroy();
                     }
                  },
                  buttons : {
                     Yes : function() {
                        ingredientEdit.save();
                        newIngredient = null;
                        self.$addDialog = null;
                        self.addIngredient(false);
					         $(this).dialog("close");
                     },
                     No : function() {
					         $(this).dialog("close");
                     }
                  }
               });
            }
         }
      },
   })
   // view to display fractional numbers, and +/- buttons to change it
   window.ServingView = Backbone.View.extend({
      initialize : function() {
         _.bindAll(this, "inc");
         _.bindAll(this, "sub");
         _.bindAll(this, "render");
         this.model.bind('all', this.render);
         this.$div = $.make("div", {"class":"serving"})
            .appendTo(this.el);
         this.$span = $.make("div", {"class":"serving-value"})
            .appendTo(this.$div);
         if (this.options.onChange) {
            var $plus = $.makeIcon("ui-icon-plus")
               .appendTo(this.$div)
               .hide()
               .click(this.inc);
            var $minus = $.makeIcon("ui-icon-minus")
               .appendTo(this.$div)
               .hide()
               .click(this.sub);
            this.$div.hover(function() {
                  $plus.show();
                  $minus.show();
               }, function() {
                  $plus.hide();
                  $minus.hide();
               });
         }
      },
      render : function() {
         // show the value
         this.$span.html(this.htmlValue(this.val()));
      },
      // get/set the value
      val : function(newVal) {
         if (newVal == undefined)
            return this.model.get(this.options.field);
         if (isNaN(newVal) || newVal < 0)
            newVal = 0;
         if (newVal != this.model.get(this.options.field))
         {
            this.$span.html(this.htmlValue(newVal));
            var vals = {};
            vals[this.options.field] = newVal;
            this.model.set(vals);
            if (this.options.onChange)
               this.options.onChange();
         }
      },
      // get the HTML view of the value
      htmlValue : function(value) {
         if (value == 0)
            return "0";
         if (value <= 0.26)
            return "&frac14;";
         if (value <= 0.34)
            return "&frac13;";
         if (value <= 0.5)
            return "&frac12;";
         if (value <= 0.67)
            return "&frac23;";
         if (value <= 0.76)
            return "&frac34;";
         var intPart = parseInt(value);
         var fracPart = value - intPart;
         if (fracPart < 0.1)
            return "" + intPart;
         return "" + intPart + this.htmlValue(fracPart);
      },
      // decrement
      sub : function() {
         var val = this.val();
         var intPart = parseInt(val);
         var fracPart = val - intPart;
         if (fracPart > 0.7) {
            val = intPart + 0.5;
         } else if (fracPart > 0.45) {
            val = intPart + 0.25;
         } else if (fracPart > 0.2) {
            val = intPart;
         } else {
            val = (intPart-1)+0.75;
         }
         if (val < 0)
            val = 0;
         this.val(val);
      },
      // increment
      inc : function() {
         var val = this.val();
         var intPart = parseInt(val);
         var fracPart = val - intPart;
         if (fracPart < 0.2) {
            val = intPart + 0.25;
         } else if (fracPart < 0.49) {
            val = intPart + 0.5;
         } else if (fracPart < 0.7) {
            val = intPart + 0.75;
         } else {
            val = intPart + 1;
         }
         if (val > 3)
            val = 3;
         this.val(val);
      },
   });
   // view to edit an ingredient
   window.IngredientEditView = window.MealplannerView.extend({
      tagName : "div",
      className : "ingredient-edit",
      icon : "ui-icon-ingredient",
      buttons : [
         {label:"Save", title: "Save this ingredient", click: "save" },
         {label:"Delete", title: "Delete this ingredient", click: "del" },
      ],
      initialize: function() {
         var self = this;
         // call base "class" initialize
         MealplannerView.prototype.initialize.call(this);
         _.bindAll(this, "dishesReceived");
         // bind render for callback
         this.model.tags.bind('all', this.render);
         // fetch tags
         this.model.tags.fetchOnce();
         // create basic edit view
         this.createEditView();
         //  grey-out Save button when already saved (hasChanged == false)
         this.$save = this.$title.find("button[value='Save']")
               .button("option", "disabled", true);
         // don't enable the delete button until we
         //  know if we're in a dish or not
         this.$delete = this.$title.find("button[value='Delete']")
               .button("option", "disabled", true);

         // create text fields
         this.$category = $("<input type='text'></input>")
            .textInput()
            .appendTo(this.newField("Category"))
            .combo({source:Ingredients.allCategories()});
         this.$source= $("<input ></input>")
            .appendTo(this.newField("Source"))
            .combo({source:["Animal", "Vegan", "Vegetarian"]});
         // create tags edit field
         this.newTagsEditField();
         // display dishes using this ingredient
         this.$dishes = $("<div class='dishes'>Loading...</div>")
            .appendTo(this.newField("Dishes with this ingredient"));
         jQuery.getJSON(this.model.url() + "/in/", this.dishesReceived);
      },
      // update view with latest values
      render : function() {
         if (this.dirty) {
            this.$save.button({disabled : false, label: "Save"}); 
         }
         // update text fields
         this.$name.val(this.model.get("Name"));
         this.$category.val(this.model.get("Category"));
         this.$source.val(this.model.get("Source"));
         // render the current tags
         this.renderTags();
         return this;
      },
      dishesReceived : function(dishIds) {
         this.$dishes.html("");
         var searchResults = {};
         _.each(dishIds, function(id) {
            searchResults[id] = 1;
         });
         this.dishListView = new DishListView({model : window.Dishes, searchResults : searchResults});
         this.$dishes.append(this.dishListView.render().el);
         if (dishIds.length > 0) {
               this.$delete.button("option", "disabled", true);
               this.$delete.attr("title", "Cannot delete an ingredient used in any dishes.");
         } else {
               this.$delete.button("option", "disabled", false);
         }
      },
      focus : function() {
         this.$name.focus();
      },
      setModels: function() {
         // save view to the model
         this.model.set({"Name": this.$name.val(),
            "Category": this.$category.val(),
            "Source": this.$source.val()
            });
         this.parseTags(true)
      },
   })
   // view for displaying an ingredient
   window.IngredientView = window.MealplannerView.extend({
      tagName : "div",
      className : "ingredient-view",
      icon: "ui-icon-ingredient",
      buttons : [
         {label:"Edit", title: "Edit This Ingredient", click: "edit" },
         {label:"Delete", title: "Delete This Ingredient", click: "del" },
      ],
      initialize: function() {
         // call base "class" initialize
         MealplannerView.prototype.initialize.call(this);
         var self = this;
         // bind methods to this
         _.bindAll(this, "edit");
         _.bindAll(this, "dishesReceived");
         _.bindAll(this, "viewDish");
         // bind to the tags change event
         this.model.tags.bind('all', this.render);
         // fetch tags
         this.model.tags.fetchOnce();
         // create basic view layout
         this.createBasicView();
         // don't enable the delete button until we
         //  know if we're in a dish or not
         this.$delete = this.$title.find("button[value='Delete']")
               .button("option", "disabled", true);
         // add text fields
         this.$category = $("<span></span>")
            .appendTo(this.newField("Category"));
         this.$source = $("<span></span>")
            .appendTo(this.newField("Source"));
         this.$tags = $("<span class='tag-list'></span>")
            .appendTo(this.newField("Tags", "ui-icon-tag"));
         // display dishes using this ingredient
         this.$dishes = $("<div class='dishes'>Loading...</div>")
            .appendTo(this.newField("Dishes with this ingredient"));
         jQuery.getJSON(this.model.url() + "/in/", this.dishesReceived);
      },
      // update the view with current data
      render : function() {
         this.$name.text(this.model.get("Name"));
         this.$category.text(this.model.get("Category"));
         this.$source.text(this.model.get("Source"));
         this.renderTags();
         return this;
      },
      // trigger edit
      edit: function(ev) {
         this.trigger("editIngredient", this.model);
      },
      // handle incoming information about dishes using this ingredient
      dishesReceived : function(dishIds) {
         this.$dishes.html("");
         var searchResults = {};
         _.each(dishIds, function(id) {
            searchResults[id] = 1;
         });
         this.dishListView = new DishListView({model : window.Dishes, searchResults : searchResults});
         this.$dishes.append(this.dishListView.render().el);
         if (dishIds.length > 0) {
               this.$delete.button("option", "disabled", true);
               this.$delete.attr("title", "Cannot delete an ingredient used in any dishes.");
         } else {
               this.$delete.button("option", "disabled", false);
         }
      },
      viewDish: function(ev) {
         this.trigger("viewDish", ev);
      },
   })
   // display on the side to control which menu is being viewed
   window.MenuBarView = window.MealplannerView.extend({
      tagName : "div",
      className : "menubar",
      events : {
         "autocompletechange input" : "changeMenu",
         "autocompleteselect input" : "changeMenu"
      },
      initialize: function() {
         // call base "class" initialize
         MealplannerView.prototype.initialize.call(this);

         // show "Menus" as title
			$.make("div")
				.addClass("name")
				.text("Menus")
				.prepend($.makeIcon("ui-icon-menu", true))
				.appendTo(this.el);
         // show a combo box to pick menus, using nowrap to keep it from splitting up the button
         var $nowrap = $("<span class='nowrap'></span>")
            .appendTo(this.el);
         this.$menus = $("<input class='menu-combo' type='text' value='<New Menu>' size='15'></input>")
               .appendTo($nowrap)
               .combo({source:[]});
      },
      // update list of menus
      render : function() {
         var menus = this.model.map(function(item) { return item.get("Name"); });
         this.$menus.autocomplete("option", "source", menus);
         this.changeMenu();
         return this;
      },
      // display the selected menu
      changeMenu : function(e, ui) {
         var self = this;
         var menuName = this.$menus.val();
         if (ui && ui.item) {
            menuName = ui.item.value;
         }
         this.model.find(function(model) {
            if (model.get("Name") == menuName) {
               if (self.menuView) {
                  self.menuView.remove();
               }
               self.menuView = new MenuView({model: model,
						readOnly: App.readOnly});
               self.el.append(self.menuView.render().el);
               return true;
            }
            return false;
         });
      },
      // accept information about the current item being viewed,
      //  pass it down to the current menu view
      setContext : function(model) {
         if (this.menuView) {
            this.menuView.setContext(model);
         }
      }
   })
   // view of basics of menu for the menu bar
   window.MenuView = window.MealplannerView.extend({
      tagName : "div",
      className : "menu-view",
      buttons : [
         {label:"Add", title: "Add to Menu", click: "addCurDish",
            icons: {primary: "ui-icon-arrowthick-1-e"} },
         {label:"Save", title: "Save Menu", click: "cloneMenu" },
         {label:"Clear", title: "Remove All Ingredients From Menu",
            click: "clearMenu" },
         {label:"Delete", title: "Delete Menu", click: "del" }
      ],
      initialize: function() {
         // call base "class" initialize
         MealplannerView.prototype.initialize.call(this);
         // bind methods to this
         _.bindAll(this, "clearMenu");
         _.bindAll(this, "cloneMenu");
         _.bindAll(this, "addCurDish");
         _.bindAll(this, "newDish");
         // bind to the events happening on all dishes so we can
         // update name and nutrition
         Dishes.bind('all', this.render);

         // create the basic layout
         this.createBasicView();
         // we don't show the name in this view, it's shown by parent
         this.$name.remove();
         // get references to our buttons
			if (!this.options.readOnly) {
         	this.$add = this.$buttons.find("button[value='Add']");
         	this.$save = this.$buttons.find("button[value='Save']");
         	// add rounding to clear, button set doesn't know only one
         	//  of delete and clear are visible at a time
         	this.$clear= this.$buttons.find("button[value='Clear']")
            	.addClass("ui-corner-right");
      	
         	this.$delete = this.$buttons.find("button[value='Delete']");
			}
         // create dish list
         this.$dishes = $("<ul class='dish-list'></ul>")
            .appendTo(this.newField("Dishes"));
         var $p = $("<p></p>")
            .appendTo(this.$fields);
            
         // create link to see detail view
         $("<a class='field-head'>Ingredients, etc. »</a>")
            .attr("href", "#viewMenu/" + this.model.id)
            .appendTo($p);
         // setup droppability to add new dishes
         $(this.el)
				.droppable({
					accept: ".dish",
					hoverClass : "ui-state-highlight drop-accept",
					drop: this.newDish
				});
         // setup charts
         var $charts = $("<div class='menu-chart'></div>")
            .appendTo(this.newField("Nutritional Balance"));
         this.$menuChart = $("<span>")
            .appendTo($charts);
         this.$targetChart = $("<span>")
            .appendTo($charts);
         $charts.append("<div class='legend'><span class='sample' style='background:#459E00;'></span> Fruits &amp; Vegetables<br><span class='sample' style='background:#B23500'></span> Protein<br><span class='sample' style='background:#770071'></span> Carbohydrates</div>");
      },
      render : function() {
         // update the view
         var self = this;
         var name = this.model.get("Name");
			if (!this.options.readOnly) {
         	if (this.model == Menus.getDraftMenu()) {
            	this.$delete.hide();
         	} else {
            	this.$clear.hide();
         	}
			}
         // prepare a list of dishes
         var self = this;
         this.$dishes.children().remove();
         var dishIds = this.model.get("Dishes");
         var dishes = _.map(dishIds, function(id) {
               return Dishes.get(id);
            });
         // remove any missing dishes
         dishes = _.compact(dishes);
         dishes = _.sortBy(dishes, function(dish) {
               return dish.get("Name");
            });
         var veggies = 0;
         var protein = 0;
         var carbs = 0;
         // create view of each item and sum the nutrition
         _.each(dishes, function(dish) {
            var $li = $("<li class='dish'></li>")
               .append($.makeIcon('ui-icon-dish'))
               .appendTo(self.$dishes)
               .draggable({revert:true,helper:'clone',appendTo:'body'});
            var name = dish.get("Name");
            $.make("a")
                  .appendTo($li)
                  .text(name)
                  .attr("href", "#viewDish/" + dish.id);
			   $li[0].model = dish;
				if (!self.options.readOnly) {
            	var $delTag = $.makeRemoveIcon()
               	.appendTo($li)
               	.click(function () {
                     	self.model.removeDish(dish);
                     	self.render();
                  	})
               	.autoHide({handle:$li});
				}
            veggies += dish.get("ServingsVeggies");  
            protein += dish.get("ServingsProtein");  
            carbs += dish.get("ServingsCarb");  
         });
         // if no dishes, give instructions for adding them
         if (dishes.length == 0) {
            self.$dishes.append("<li class='dish'>Drag dishes here to add them to the menu, or click the 'Add' button above.</li>");
         }
         // update button state
			if (!this.options.readOnly) {
         	if ( this.curDish()) {
               // allow the current dish to be added if we don't have it yet
            	if (this.model.hasDish(this.curDish())) {
               	this.$add.button("option", "disabled", true);
            	} else {
               	this.$add.button("option", "disabled", false);
            	}
         	} else {
               // if the current item isn't a dish, can't add it
            	this.$add.button("option", "disabled", false);
         	}
         }
         // delay chart drawing, because it fails if the
         //  element isn't rooted in the document yet
         setTimeout( function() {
            self.drawChart(self.$menuChart, "This Menu", veggies, protein, carbs);
            self.drawChart(self.$targetChart, "Target", 2, 1, 1);
            }, 10);
         return this;
      },
      // handle clearing the menu
      clearMenu : function() {
         this.model.save({Dishes:[]});
         this.render();
      },
      // handle drop of a new dish
      newDish : function(evt, ui) {
		   var other = ui.draggable[0].model;
         if (other && !this.model.hasDish(other)) {
            var dishes = this.model.get("Dishes");
            dishes.push(other.id);
            this.model.save({Dishes:dishes});
            this.render();
         }
      },
      // get the dish from the current context
      curDish : function() {
         if (App.curContext) {
            if (App.curContext.defaults == Dish.prototype.defaults)
               return App.curContext;
         }
         return null;
      },
      // add the currently viewed dish to the menu
      addCurDish : function() {
		   var other = this.curDish();
         if (other && !this.model.hasDish(other)) {
            var dishes = this.model.get("Dishes");
            dishes.push(other.id);
            this.model.save({Dishes:dishes});
         }
         this.render();
      },
      // update the add button enabled based on the context 
      setContext : function(model) {
         var showAdd = true;
         if (model && model.defaults == Dish.prototype.defaults) {
            if (this.model.hasDish(model)) {
               showAdd= false;
            }
         } else {
            showAdd = false;
         }
			if (!this.options.readOnly) {
         	this.$add.button("option", "disabled", !showAdd);
			}
      }
   })
   // detail view of a menu, similar to MEnuView, but shows
   //  a list of all ingredients, and extra detail about each dish
   window.MenuDetailView = window.MealplannerView.extend({
      tagName : "div",
      className : "menu-view",
      icon : "ui-icon-menu",
      buttons : [
         {label:"Save", title: "Save Menu", click: "cloneMenu" },
         {label:"Clear", title: "Remove All Ingredients From Menu",
            click: "clearMenu" },
         {label:"Delete", title: "Delete Menu", click: "del" }
      ],
      initialize: function() {
         // call base "class" initialize
         MealplannerView.prototype.initialize.call(this);
         // bind methods tothis
         _.bindAll(this, "clearMenu");
         _.bindAll(this, "cloneMenu");
         _.bindAll(this, "newDish");
         // create basic layout
         this.createBasicView();
         // get handles to buttons
			if (!this.options.readOnly) {
         	this.$save = this.$buttons.find("button[value='Save']");
         	// add rounding to clear, button set doesn't know only one
         	//  of delete and clear are visible at a time
         	this.$clear= this.$buttons.find("button[value='Clear']")
            	.addClass("ui-corner-right");
      	
         	this.$delete = this.$buttons.find("button[value='Delete']");
			}
         // create fields
         this.$dishes = $("<ul class='dish-list'></ul>")
            .appendTo(this.newField("Dishes"));
         this.$ingredients= $("<ul class='ingredient-list'></ul>")
            .appendTo(this.newField("All Ingredients"));
         var $charts = $("<div class='menu-chart'></div>")
            .appendTo(this.newField("Nutritional Balance"));
         this.$menuChart = $("<span>")
            .appendTo($charts);
         this.$targetChart = $("<span>")
            .appendTo($charts);
         $charts.append("<div class='legend'><span class='sample' style='background:#459E00;'></span> Fruits &amp; Vegetables<br><span class='sample' style='background:#B23500'></span> Protein<br><span class='sample' style='background:#770071'></span> Carbohydrates</div>");
         // setup drop target for adding dishes
         this.el.droppable({
					accept: ".dish",
					hoverClass : "ui-state-highlight drop-accept",
					drop: this.newDish
				});
      },
      render : function() {
         // update view with current data
         var self = this;
         var name = this.model.get("Name");
         this.$name.text(name);
         // switch between delete/clear if we're the "<New Menu>" draft menu
			if (!this.options.readOnly) {
         	if (this.model == Menus.getDraftMenu()) {
            	this.$delete.hide();
         	} else {
            	this.$clear.hide();
         	}
			}
         // construct list of dishes, getting ingredients to be fetched
         //  and gathering other data for nutrition
         var self = this;
         this.$dishes.children().remove();
         var dishIds = this.model.get("Dishes");
         var dishes = _.map(dishIds, function(id) {
               return Dishes.get(id);
            });
         // remove any missing dishes
         dishes = _.compact(dishes);
         dishes = _.sortBy(dishes, function(dish) {
               return dish.get("Name");
            });
         var veggies = 0;
         var protein = 0;
         var carbs = 0;
         var allIngredients = {};
         _.each(dishes, function(dish) {
            dish.ingredients.fetchOnce({success: self.render});
            dish.ingredients.each(function(ingredient) {
               var model = Ingredients.get(ingredient.get("Ingredient"));
               if (model) {
                  var text =dish.get("Name");
                  var amount = ingredient.get("Amount");
                  if (amount.length > 0) {
                     text = "[" + amount + "] " + text;
                  }
                  if (model.id in allIngredients) {
                     allIngredients[model.id].dishes.push(text); 
                  } else {
                     allIngredients[model.id] = {ingredient : model, dishes : [text]};
                  }
               }
            });
            var $li = $("<li class='dish'></li>")
					.append($.makeIcon("ui-icon-dish"))
               .appendTo(self.$dishes)
               .draggable({revert:true,helper:'clone',appendTo:'body'});
			   $li[0].model= dish;
            var name = dish.get("Name");
            $("<a></a>")
                  .appendTo($li)
                  .text(name)
                  .attr("href", "#viewDish/" + dish.id);
            $li.append( " " + dish.get("PrepTimeMinutes") + " + " + dish.get("CookTimeMinutes") + " = " + (parseInt(dish.get("PrepTimeMinutes")) + parseInt(dish.get("CookTimeMinutes"))) + " minutes");
				if (!self.options.readOnly) {
            	var $delTag = $.makeRemoveIcon()
               	.appendTo($li)
               	.click(function () {
                     	self.model.removeDish(dish);
                     	self.render();
                  	})
               	.autoHide({handle: $li});
				}
            veggies += dish.get("ServingsVeggies");  
            protein += dish.get("ServingsProtein");  
            carbs += dish.get("ServingsCarb");  
         });

         // prepare consolidated list of ingredients
         this.$ingredients.children().remove();
         var ingredients = _.sortBy(allIngredients, function(ing) {
               return ing.ingredient.get("Name");
            });
         _.each(ingredients, function(ing) {
            var ingredient = ing.ingredient;
            var $li = $("<li class='ingredient'></li>")
					.append($.makeIcon('ui-icon-ingredient'))
               .appendTo(self.$ingredients)
               .draggable({revert:true,helper:'clone',appendTo:'body'});
			   $li[0].model= ingredient;
            var name = ingredient.get("Name");
            $("<a></a>")
                  .appendTo($li)
                  .attr("href", "#viewIngredient/" + ingredient.id)
                  .text(name);
            _.each(ing.dishes, function(dishName, index) {
               if (index > 0) {
                  $li.append(", ");
               } else {
                  $li.append(" &ndash; ");
                  }
                  $li.append(dishName);
               });
         });
         
         // delay chart drawing, because it fails if the
         //  element isn't rooted in the document yet
         setTimeout( function() {
            self.drawChart(self.$menuChart, "This Menu", veggies, protein, carbs);
            self.drawChart(self.$targetChart, "Target", 2, 1, 1);
            }, 10);
         return this;
      },
      // handle clearing the menu
      clearMenu : function() {
         this.model.save({Dishes:[]});
         this.render();
      },
      // handle drop of a new dish
      newDish : function(evt, ui) {
		   var other = ui.draggable[0].model;
         if (other && !this.model.hasDish(other)) {
            var dishes = this.model.get("Dishes");
            dishes.push(other.id);
            this.model.save({Dishes:dishes});
            this.render();
         }
      },
   })
   // view for displaying user info and menu in upper left
   window.UserView = Backbone.View.extend({
      el : $("#user"),
      className : "user",
      initialize : function() {
         this.el = $(this.el);
         // bind handlers
         _.bindAll(this, "render");
         _.bindAll(this, "listLibraries");
         _.bindAll(this, "shareLibrary");
         _.bindAll(this, "restore");
         // create title view with name/email
			this.$title = $.make("span")
				.appendTo(this.el)
         // make menu
         this.$menu = $.make("div")
               .appendTo(this.el)
               .mpmenu({handle:this.el});
         // section with libraries
			this.$libs = $.make("div", {"class":"section"})
               .appendTo(this.$menu);
			// section with help
			this.$helpsection= $.make("div", {"class":"section"})
					.append($("<div class='field-head'>Help</div>")
								.prepend($.makeIcon("ui-icon-help")))
               .appendTo(this.$menu);
			$.make("a", {"href" : "#tutorial"}, "Tutorial")
				.click(function() { this.$menu.hide(); return true; }.bind(this))
				.appendTo(this.$helpsection);
			this.$helpsection.appendNew("br")
			$.make("a", {"href" : "#about"}, "About")
				.click(function() { this.$menu.hide(); return true; }.bind(this))
				.appendTo(this.$helpsection);
         // section with backup-restore
			this.$brsection= $.make("div", {"class":"section"})
					.append($("<div class='field-head'>Backup/Restore</div>")
								.prepend($.makeIcon("ui-icon-transferthick-e-w")))
               .appendTo(this.$menu);
			this.$brsection.append("<a href='/backup' title='Save this file to backup the database.'>Backup</a><br/>");
			this.$restoreform = $.make("form", {
					"id": "restore-form",
					action: "/restore",
					method: "POST",
					enctype:"multipart/form-data"
			})
				.appendTo(this.$brsection);
			this.$restoreform
				.append("<span title='Choose a backup file below.'>Restore</span>:<br/>");
			this.$restorefile = $.make("input", {
				 	type:"file",
					name:"restore-file",
					id:"restore-file"
				})
				.appendTo(this.$restoreform)
            .change(this.restore);
         // sign out link
			this.$signout = $.make("div", {"class":"section"})
               .appendTo(this.$menu);
         // bind to events for the user
         this.model.bind('all', this.render);
         // fetch list of libraries
			jQuery.getJSON("/libraries", this.listLibraries);
      },
      // render the user's information
      render : function() {
         if (this.model.length > 0) {
            var user = this.model.at(0);
            this.$title.text(user.get("Name"));
				this.$signout
               .html($.make("a", {href:user.get("logoutURL")},
                              "Sign out"))
					.prepend($.makeIcon("ui-icon-person"));
				
         }
         return this;
      },
      // handle incoming list of libraries
		listLibraries : function(data) {
			var self = this;
			var $libs = this.$libs;
			$libs.html();
			$.make("div", "Libraries")
				.addClass("field-head")
				.prepend($.makeIcon("ui-icon-folder-collapsed"))
				.appendTo($libs);
         // create links to switch the view to the other library
			_.each(data, function (lib) {
				var $l;
				if (lib.Current) {
					var extra = " (current)";
					if (lib.ReadOnly) {
						extra = " (current, read-only)";
						self.$restoreform.hide();
					}
               // let the app know if we're looking at a read-only library
					App.setReadOnly(lib.ReadOnly);
					$l = $.make("div", {"class" : "current-lib"})
									.text(lib.Name + extra);
					$libs.children().first()
						.after($l);
				} else {
					$l = $.make("div")
						.appendTo($libs)
						.append($.make("a", { href: "/switch/" + lib.Id })
										.text(lib.Name));
					if (lib.ReadOnly) {
						$l.append(" (read-only)");
					}
				}
				if (lib.Owner) {
               self.ownedLibrary = lib.Id;
					$l.append(" ");
					var $share = $.make("a", "Share...")
						.click(self.shareLibrary)
						.appendTo($l);
				}
			})
		},
      // pop-up dialog to let user send email to share their library
		shareLibrary : function() {
         var self = this;
         // prepare dialog
         var $content = $.make("div",
            "Enter the email address of the person you want to share your meal planning library with:<br>");
         var $dialog = $.make("div");
            $dialog.append($content);
         var $email = $.make("input", {type:"text", name:"email"})
            .textInput({size:30})
            .appendTo($content);
         $content.append("<br/>");
         var $write = $.make("input", {type:"checkbox", name:"write"})
            .appendTo($content);
         $content.append(" Allow the user to modify your library.");
         // show dialog and setup buttons to handle the share
         $dialog
            .appendTo(document.body)
            .dialog( {
               modal: true,
               title: "Share Your Library",
               buttons : {
                  "Share" : function() {
                     // to share, we use HTTP to fetch a URL
                     //  we then update Success/Failure in dialog
                     //  when complete
                     var url = "/share/";
                     if ($write[0].checked) {
                        url += "write/email/";
                     } else {
                        url += "read/email/";
                     }
                     url += $email.val();
                     $dialog.dialog("option", "buttons", {});
                     $content.html("Sending email...");
                     jQuery.get(url)
                        .success(function(resp) {
                           $content.html("Successs");
                           $dialog.dialog("option", "buttons", {
                              Close : function() {
                                 $dialog.dialog("close");
                              }
                           });
                     
                        })
                        .error(function(resp) {
                           $content.html("Failed: " + resp);
                           $dialog.dialog("option", "buttons", {
                              Close : function() {
                                 $dialog.dialog("close");
                              }
                           });
                     
                        })
                  },
                  "Cancel" : function() {
                     $dialog.dialog("close");
                  }
               }
            });
            
		},
      // handle the restore operation
		restore : function() {
         // show a dialog so that user will know the import is starting
         // and won't try starting another one or do other things that could
         // cause the import to fail
         var $dialog = $.make("div", "Please wait while the data is imported.")
            .appendTo(document.body)
            .dialog({
               title : "Importing...",
               modal : true,
               closeOnEscape: false,
            });
         // post the form to send the data to the server
			this.$restoreform.submit();
		}
   })
   // simple view to show the user that data is being loaded
   window.LoadingView = Backbone.View.extend({
      tagName : "div",
      className : "search-view",
      initialize : function() {
         this.el = $(this.el);
         this.el.html("<H2>Loading...</h2>");
      },
      render : function() {
         return this;
      }
   });
	// simple view to show the help/about
   window.AboutView = Backbone.View.extend({
      tagName : "div",
      className : "about",
      initialize : function() {
         this.el = $(this.el);
         this.el.html($("#about").html())
      },
      render : function() {
         return this;
      }
   });
	// simple view to show the tutorial
   window.TutorialView = Backbone.View.extend({
      tagName : "div",
      className : "tutorial",
      initialize : function() {
         this.el = $(this.el);
         this.el.html($("#tutorial").html())
			var $toc = this.el.find("ul.toc");
			var $uls = [$toc];
			$uls.push($.make("ul"));
			var $anchors = this.el.find("a[name]");
			var last = "H3";
			$anchors.each(function(idx, a) {
				var $a = $(a);
				var $parent = $a.parent();
				var $ul = $uls[$uls.length-1];
				var tagName = $parent.attr("tagName");
				if (tagName == last) {
					$uls.pop();
					$ul = $uls[$uls.length-1];
				} else if (tagName < last) {
					$uls.pop();
					$uls.pop();
					$ul = $uls[$uls.length-1];
				}
				last = tagName;
				var $next = $.make("ul");
				$.make("li")
					.appendNew("a", {"href": "#"+ $a.attr("name")}, $parent.text())
					.append($next)
					.appendTo($ul)
				$uls.push($next);
			})
      },
      render : function() {
         return this;
      }
   });

   // view to show search query, filter and results
   window.SearchView = window.MealplannerView.extend({
      tagName : "div",
      className : "search-view",
      initialize : function() {
         this.el = $(this.el);
         // bind our methods to this
         _.bindAll(this, "startSearch");
         _.bindAll(this, "render");
         _.bindAll(this, "searchComplete");
         _.bindAll(this, "textSearch");
         _.bindAll(this, "search");
         _.bindAll(this, "addSearchSuggestions");
         _.bindAll(this, "parseTags");
         // bind to our model
         if (!this.model) {
            this.model = new Search();
         }
         this.model.bind('change', this.startSearch);
         // create input for keywords
         this.$words = $.make("input", {type:"text"})
               .textInput({size:15})
               .appendTo(this.el);
         // fetch tags to use for a suggestion
         jQuery.getJSON("/tags", this.addSearchSuggestions);
         // create button to start a search
         this.$doSearch = $.make("button")
               .button({title: "Start Search",
                        text: false,
                        icons: {primary: "ui-icon-search"}})
               .click(this.textSearch)
               .appendTo(this.el);
         var self = this;
         // setup event handlers so we'll search when data changes
         this.$words
            .bind('autocompletechange', this.textSearch)
            .bind('change', this.textSearch);
         // setup the fields section
         this.$fields= $.make("div")
            .appendTo(this.el);
         // add rating filter
         this.$stars = this.newRatingField(" &ge; ");
         // add tags input to filter on tags
         var $tagField = this.newField("Tags", "ui-icon-tag");
         this.$tags = $("<span class='tag-list'></span>")
            .appendTo($tagField);
         this.$newTags = $("<input type='text'></input>")
            .bind('keypress', function (evt) {
               if (evt.which == 13) {
                  //evt.preventDefault();
                  self.parseTags()
               }
            })
            .textInput()
            .bind('autocompletechange', this.parseTags)
            .bind('change', this.parseTags)
            .appendTo($tagField);
         // setup results section
         this.$results = $.make("div")
            .appendTo(this.el);
         // create dish list view for dish results
         this.dishListView = new DishListView({
            model : window.Dishes,
            searchResults: [],
            minRating : this.model.get("Rating"),
         });
         // create ingredient list view for ingredient list
         this.ingredientListView = new IngredientListView({
            model : window.Ingredients,
            searchResults: [],
         });
         // start the search
         this.startSearch();
      },
      // outside call to update our search model
      search : function(model) {
         if (!model) return;
         // destroy any previous models
         if (this.model) {
            this.model.destroy();
         }
         // bind new events
         this.model = model;
         this.model.bind('change', this.startSearch);
         // start the search
         this.startSearch();
         // update the view
         this.render();
      },
      // update our search with the text
      textSearch : function() {
         this.model.set({Word: this.$words.val()});
      },
      startSearch : function() {
         // start our query
         // make sure we've parsed all tags entered
         this.parseTags();
         // prepare the query data we send to server
         var attrs = $.extend({}, this.model.attributes);
         // remove Rating -- we'll filter on rating locally
         delete attrs["Rating"];
         // prepare the query to be posted
         var query = JSON.stringify(attrs);
         // skip the trip to the server if nothing has changed (maybe just
         //  the rating was changed)
         if (this.lastResults && this.lastQuery == query) {
            // update the view of the results we have
            this.searchComplete(this.lastResults);
            return;
         }
         this.lastQuery = query;
         // handle the special case when there are no words and no tags,
         //  we can localy return all items, and allow the local ratings
         //  filter to be done
         var tags = this.model.get("Tags");
         var word = this.model.get("Word");
         if ( ((!tags) || tags.length == 0) 
             && ((!word) || word.length == 0)) {
            if (Dishes.length > 0 && Ingredients.length > 0) {
               var dishes = {};
               Dishes.each(function(i) { return dishes[i.id] = 1; })
               var ings = {};
               Ingredients.each(function(i) { return ings[i.id] = 1;})
               this.searchComplete({
                  Dish : dishes,
                  Ingredient : ings
               });
            }
         } else {
            jQuery.post("/search", query, this.searchComplete);
         }
      },
      // handle incoming search results
      // they come in the form of a dictionary:
      // { id : count, id : count, ...}
      // where count indicates how many words matched so things can be ranked
      searchComplete :  function(results) {
         this.lastResults = results;
         if (! ("Dish" in results)) {
            results.Dish = {};
         }
         if (! ("Ingredient" in results)) {
            results.Ingredient = {};
         }
         this.dishListView.options.searchResults = results.Dish;
         this.dishListView.options.minRating = this.model.get("Rating");
         this.ingredientListView.options.searchResults
            = results.Ingredient;
         this.render();
      },
      // update our view based on the query we're building
      render : function() {
         var rating = this.model.get("Rating");
         for (var i = 0; i < 5; i ++)
         {
            if (rating >= (i+1))
               this.$stars.eq(i).removeClass("disabled");
            else
               this.$stars.eq(i).addClass("disabled");
         }
         this.renderTags();
         this.$results.html("");
         if (this.dishListView || this.ingredientListView) {
            this.$results.append("<div class='field-head'>Dishes</div>");
            this.$results.append(this.dishListView.render().el);
            this.$results.append("<div class='field-head'>Ingredients</div>");
            this.$results.append(this.ingredientListView.render().el);
         } else {
            this.$results.html("Searching...");
         }
         if (this.model) {
			   var words = "";
			   if (this.model.get("Word"))
				   words = this.model.get("Word");
			   this.$words.val($.trim(words))
         }
         return this;
      },
      // update the view of the tags being filtered
      renderTags : function () {
         var self = this;
         var $tags = this.$tags;
         var tags = this.model.get("Tags");
         $tags.html("");
         if ((!tags) || tags.length == 0)
            $tags.append("[none]");
         _.each(tags, function(tag, t) {
            if (t > 0)
               $tags.append(", ");
            var $tag = $("<div class='tag'></div>")
               .appendTo($tags);
            var $text = $("<span></span>")
               .appendTo($tag)
               .text(tag);
				if (!self.options.readOnly) {
            	var $delTag = $.makeRemoveIcon()
               	.appendTo($tag)
               	.click(function () {
                     	var newTags = self.model.get("Tags");
                     	newTags = _.filter(newTags, function(ftag) {
                           	return ftag != tag;
                        	});
                     	self.model.set({Tags: newTags});
                  	})
               	.autoHide({handle:$tag});
				}
         });
      },
      // update autocomplete with our list of tags
      //  as suggestions
      addSearchSuggestions : function(tags) {
         this.$words.autocomplete({source: tags});
         this.$newTags.autocomplete({source: tags});
      }
   })

   // setup global collections
   window.Users = new UserList
   window.Dishes = new DishList
   window.Ingredients = new IngredientList
   window.Menus = new MenuList
   // setup the router, so we can track in the broswer history and
   //  bookmark individual views
   var Router = Backbone.Router.extend({
      routes: {
         "viewDish/:id": "viewDish",
         "editDish/:id": "editDish",
         "viewIngredient/:id": "viewIngredient",
         "editIngredient/:id": "editIngredient",
         "viewMenu/:id": "viewMenu",
         "search/:tag/:word/:rating": "search",
         "tutorial": "viewTutorial",
         "about": "viewAbout",
      },
      viewDish : function(id) {
         var m = window.Dishes.get(id);
         if (m)
            window.App.viewDish(m);
      },
      editDish : function(id) {
         var m = window.Dishes.get(id);
         if (m)
            window.App.editDish(m);
      },
      viewIngredient : function(id) {
         var m = window.Ingredients.get(id);
         if (m)
            window.App.viewIngredient(m);
      },
      editIngredient : function(id) {
         var m = window.Ingredients.get(id);
         if (m)
            window.App.editIngredient(m);
      },
      viewMenu : function(id) {
         var m = window.Menus.get(id);
         if (m)
            window.App.viewMenu(m);
      },
      viewTutorial : function() {
         window.App.viewTutorial();
      },
      viewAbout : function() {
         window.App.viewAbout();
      },
      search : function(tag,word,rating) {
         var attrs = {};
         if (tag)
            attrs.Tags = [tag];
         if (word)
            attrs.Word = word;
         if (rating)
            attrs.Rating = parseInt(rating);
         var search = new Search(attrs);
         window.App.search(search);
      }
   });
   window.Workspace = new Router();
   // the main app view that gets everything startd
   window.AppView = Backbone.View.extend({
      el : $("#app"),
      initialize : function() {
         // bind methods to this
         _.bindAll(this, "render");
         _.bindAll(this, "newDish");
         _.bindAll(this, "editDish");
         _.bindAll(this, "viewDish");
         _.bindAll(this, "newIngredient");
         _.bindAll(this, "viewIngredient");
         _.bindAll(this, "editIngredient");
         _.bindAll(this, "viewMenu");
         _.bindAll(this, "renderTags");
         _.bindAll(this, "onFetched");
         _.bindAll(this, "onMenuFetched");
         _.bindAll(this, "refresh");
         // global flag for use in tracking if we are looking
         //  at a readOnly library so we don't show editing in the UI
			this.readOnly = false;
         // top-level views
         this.userView = new UserView({model : Users});
         this.searchView = new SearchView({el: $("#search-tab")}).render();
         this.mainView = null;
         this.dishListView = new DishListView({model : Dishes});
         // prepare the tabs
         $("#dishes").append(this.dishListView.render().el);
         this.ingredientListView = new IngredientListView({model : Ingredients});
         $("#ingredients").append(this.ingredientListView.render().el);
         $("#side-tabs").tabs({ });

         // connect the refresh button
         this.el.find(".refresh")
               .button({text:true, label:"&zwj;", icons:{primary:"ui-icon-refresh"}})
               .click(this.refresh);
         // connect the add buttons
         this.el.find(".add-dish")
                  .button({icons : {primary:"ui-icon-pencil"}})
                  .click(this.newDish);
         this.el.find(".add-ingredient")
                  .button({icons : {primary:"ui-icon-pencil"}})
                  .click(this.newIngredient)
                  .parent()
                     .buttonset();
         // setup fetch counter so we can know when to remove the LoadingView
         this.fetched = 0;
         // kick of a fetch
         this.refresh();
      },
      refresh : function() {
         if (this.fetched > 0) {
            window.Workspace.navigate("refresh");
         }
         // show the user we're loading
         this.show(new LoadingView());
         // fetch each top-level collection
         Menus.fetch({success:this.onMenuFetched, error:this.onFetched});
         Users.fetch({success:this.onFetched, error:this.onFetched});
         Dishes.fetch({success:this.onFetched, error:this.onFetched});
         Ingredients.fetch({success:this.onFetched, error:this.onFetched});
         // fetch tags
         jQuery.getJSON("/tags", this.renderTags);
      },
      // set the readOnly flag when we know about libraries
		setReadOnly : function(readOnly) {
			this.readOnly = readOnly;
			if (readOnly) {
         	this.el.find(".add-ingredient").hide();
         	this.el.find(".add-dish").hide();
			} else {
         	this.el.find(".add-ingredient").show();
         	this.el.find(".add-dish").show();
			}
		},
      // handle fetching of the menus
      onMenuFetched : function() {
         // make sure we have a menu to be built up
         Menus.getDraftMenu();
         if (!this.menuBarView) {
            this.menuBarView = new MenuBarView({model: Menus});
            if (this.mainView && this.mainView.model) {
               this.menuBarView.setContext(this.mainView.model);
            } else {
               this.menuBarView.setContext(null);
            }
            $("#menubar").append(this.menuBarView.render().el);
         }
         // continue as we do for other collections
         this.onFetched();
      },
      onFetched : function() {
         // count how many fetches have finished
         this.fetched++;
         // if we have 4, we can start the history and navigate
         //  to any items we might have bookmarked
         if (this.fetched == 4) {
            Backbone.history || (Backbone.history = new Backbone.History);
            try {
               Backbone.history.start();
            } catch (e) {
            }
         }
         // remove the loading view when we've finished loading
         if (this.fetched % 4 == 0) {
            if (this.mainView
                && this.mainView.constructor == LoadingView) {
               this.show(new TutorialView());
            }
         }
      },
      // render the app
      render : function() {
         this.userView.render();
         return this
      },
      // update the tags tab with the list of tags
      renderTags : function(tags) {
         var $tags = $("#tags");
         for (var tag in tags)
         {
            var $li = $("<li class='tag'></li>")
               .appendTo($tags);
            $.make("a")
               .appendTo($li)
               .text(tags[tag])
               .attr("href", "#search/" + tags[tag] + "//");
         }
      },
      // show a view in the main pane
      show : function(view) {
         // remove any existing view
         if (this.mainView)
            this.mainView.remove();
         if (view == null)
         {
            this.mainView = null;
            return;
         }
         // bind to the events triggered by the new view
         view.bind("viewDish", this.viewDish);
         view.bind("viewIngredient", this.viewIngredient);
         view.bind("editDish", this.editDish);
         view.bind("editIngredient", this.editIngredient);
         this.mainView = view;
         // scroll to make the top of the new view visible
         $(window).scrollTop(0);
         $("#main").append(view.render().el);
         // call the focus method if the view has one
         if (view.focus)
            view.focus();
         // update the document title with the item's name
         if (view.model) {
            this.curContext = view.model;
			   document.title = view.model.get("Name");
         }
         // if there is a model, track it and tell the menuBarView
         //  so it can update buttons
         if (this.menuBarView) {
            this.menuBarView.setContext(view.model);
         }
      },
      // start a search
      search : function (search) {
         $("#side-tabs").tabs('select', 0);
         this.searchView.search(search);
      },
      // reate a new dish
      newDish : function() {
			if (this.readOnly) { return; }
         var nd = Dishes.create({}, { success : function( model) {
            this.editDish(model)
         }.bind(this)});
      },
      // create a new view of a dish
      viewDish : function(dish) {
         var viewDish = new DishView({model : dish,
				readOnly: this.readOnly})
         viewDish.bind("edit", this.editDish);
         this.show(viewDish);
         // save this to browser history
         window.Workspace.navigate("viewDish/" + dish.id);
      },
      // create a new edit view for a dish
      editDish : function(dish) {
         // for read-only, route to view
			if (this.readOnly) { return this.viewDish(dish); }
         var editDishView = new DishEditView({model : dish})
         this.show(editDishView);
         // save this to browser history
         window.Workspace.navigate("editDish/" + dish.id);
      },
      // create a new ingredient
      newIngredient : function() {
			if (this.readOnly) { return; }
         Ingredients.create({}, {success:
            function(model) {
               this.editIngredient(model)
         }.bind(this)});
      },
      // create a new view of an ingredient
      viewIngredient : function(ingredient) {
         var viewIngredient = new IngredientView({model : ingredient,
				readOnly: this.readOnly })
         viewIngredient.bind("edit", this.editIngredient);
         this.show(viewIngredient);
         // save this to browser history
         window.Workspace.navigate("viewIngredient/" + ingredient.id);
      },
      // create a new edit view for an ingredient
      editIngredient : function(ingredient) {
         // for read-only, route to view
			if (this.readOnly) return this.viewIngredient(ingredient);
         var editIngredientView = new IngredientEditView({model : ingredient})
         this.show(editIngredientView);
         // save this to browser history
         window.Workspace.navigate("editIngredient/" + ingredient.id);
      },
      // create a new view of a menu
      viewMenu : function(model) {
         var viewMenu = new MenuDetailView({model : model,
				readOnly: App.readOnly })
         this.show(viewMenu);
         // save this to browser history
         window.Workspace.navigate("viewMenu/" + model.id);
      },
      // view the help/tutorial display
      viewTutorial : function() {
         this.show(new TutorialView());
         // save this to browser history
         window.Workspace.navigate("tutorial");
      },
      // view the help/about display
      viewAbout : function() {
         this.show(new AboutView());
         // save this to browser history
         window.Workspace.navigate("about");
      },
   })

   window.App = new AppView;
})

