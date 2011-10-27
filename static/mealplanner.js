jQuery(function() {
   "use strict";
   function makeCombo($autocomplete) {
      $autocomplete
         .addClass("ui-widget")
         .addClass("ui-combo")
         .css("margin-right", 0);
      $("<div></div>")
         .insertAfter($autocomplete)
         .button({
            icons: {
            primary: "ui-icon-triangle-1-s"
            },
            text: false,
            label: "Show suggested values"
         })
         .removeClass( "ui-corner-all" )
         .addClass( "ui-corner-right" )
         .click(function() {
            $(this).blur();
            $autocomplete.autocomplete("search", "" );
            $autocomplete.focus();
            });
   }
   window.Word = Backbone.Model.extend({
      defaults : {
         Word : ""
      },
      parse : function(response) {
         var attrs = Backbone.Model.prototype.parse.call(this, response);
         attrs.id = attrs.Id;
         return attrs;
      }
   });
   window.WordList = Backbone.Collection.extend({
      model: Word,
      comparator : function(mi) {
         return mi.get("Word");
      },
      parse : function(response) {
         var models = Backbone.Model.prototype.parse.call(this, response);
         
         for (var m in models)
         {
            models[m].id = models[m].Id;
         }
         return models;
      }
   })
   window.Pairing = Backbone.Model.extend({
      defaults : {
         Other : "",
			Description : ""
      },
      parse : function(response) {
         var attrs = Backbone.Model.prototype.parse.call(this, response);
         attrs.id = attrs.Id;
         return attrs;
      }
   });
   window.PairingList = Backbone.Collection.extend({
      model: Pairing,
      parse : function(response) {
         var models = Backbone.Model.prototype.parse.call(this, response);
         
         for (var m in models)
         {
            models[m].id = models[m].Id;
         }
         return models;
      }
   })
   window.MeasuredIngredient = Backbone.Model.extend({
      defaults : {
         Ingredient : "",
         Amount : "",
         Instruction : "",
         Order : 0
      },
      parse : function(response) {
         var attrs = Backbone.Model.prototype.parse.call(this, response);
         attrs.id = attrs.Id;
         return attrs;
      }
   });
   window.MeasuredIngredientList = Backbone.Collection.extend({
      model: MeasuredIngredient,
      comparator : function(mi) {
         return mi.get("Order");
      },
      parse : function(response) {
         var models = Backbone.Model.prototype.parse.call(this, response);
         
         for (var m in models)
         {
            models[m].id = models[m].Id;
         }
         return models;
      }
   })
   window.Dish = Backbone.Model.extend({
      initialize: function() {
         this.ingredients = new MeasuredIngredientList;
         if (this.id)
            this.ingredients.url = "/dish/" + this.id + "/mi/";
         this.tags = new WordList;
         if (this.id)
            this.tags.url = "/dish/" + this.id + "/tags/";
			this.pairings = new PairingList;
         if (this.id)
            this.pairings.url = "/dish/" + this.id + "/pairing/";
      },
      validate: function(attrs) {
         if (attrs.Name && attrs.Name.length == 0)
            return "Must give your dish a name";
         if (attrs.PrepTimeMin && attrs.PrepTimeMin == NaN)
            return "Must give prep time in minutes";
         if (attrs.CookTimeMin && attrs.CookTimeMin == NaN)
            return "Must give cook time in minutes";
      },
      defaults : function() { return {
         Name : "<New Dish>",
         DishType : "",
         Tags : [],
         PrepTimeMinutes : 0,
         CookTimeMinutes : 0,
         Rating : 0,
         Source : "" };
      },
      parse : function(response) {
         var attrs = Backbone.Model.prototype.parse.call(this, response);
         attrs.id = attrs.Id;
         if (attrs.id)
         {
            this.ingredients.url = "/dish/" + attrs.id + "/mi/";
            this.tags.url = "/dish/" + attrs.id + "/tags/";
            this.pairings.url = "/dish/" + attrs.id + "/pairing/";
         }
         return attrs;
      }
   });
   window.DishList = Backbone.Collection.extend({
      url: "/dish/",
      model: Dish,
      comparator : function(dish) {
         return dish.get("Name");
      },
      parse : function(response) {
         var models = Backbone.Model.prototype.parse.call(this, response);
         
         for (var m in models)
         {
            models[m].id = models[m].Id;
         }
         return models;
      }
   })
   window.Ingredient = Backbone.Model.extend({
      initialize: function() {
         this.tags = new WordList;
         if (this.id)
            this.tags.url = "/dish/" + this.id + "/tags/";
      },
      validate: function(attrs) {
         if (attrs.Name && attrs.Name.length == 0)
            return "Must give your ingredient a name";
      },
      defaults : function() { return {
         Name : "<New Ingredient>",
         Category : "",
         Source : "Vegan",
         Tags : [] };
      },
      parse : function(response) {
         var attrs = Backbone.Model.prototype.parse.call(this, response);
         attrs.id = attrs.Id;
         if (attrs.id)
         {
            this.tags.url = "/ingredient/" + attrs.id + "/tags/";
         }
         return attrs;
      }
   });
   window.IngredientList = Backbone.Collection.extend({
      url: "/ingredient/",
      model: Ingredient,
      comparator : function(ingredient) {
         return ingredient.get("Name");
      },
      parse : function(response) {
         var models = Backbone.Model.prototype.parse.call(this, response);
         
         for (var m in models)
         {
            models[m].id = models[m].Id;
         }
         return models;
      }
   })
   window.Menu = Backbone.Model.extend({
      defaults : {
			Name : "<New Menu>",
         Dishes : []
      },
      parse : function(response) {
         var attrs = Backbone.Model.prototype.parse.call(this, response);
         attrs.id = attrs.Id;
         return attrs;
      },
      hasDish : function (dish) {
         var dishes = this.get("Dishes");
         for(var d in dishes) {
            if (dishes[d] == dish.id)
               return true;
         }
         return false;
      },
      removeDish : function (dish) {
         var dishes = this.get("Dishes");
         for(var d in dishes) {
            if (dishes[d] == dish.id) {
               dishes.splice(d,1);
            }
         }
         this.save({Dishes:dishes});
      }
   });
   window.MenuList = Backbone.Collection.extend({
      url: "/menu/",
      model: Menu,
      parse : function(response) {
         var models = Backbone.Model.prototype.parse.call(this, response);
         
         for (var m in models)
         {
            models[m].id = models[m].Id;
         }
         return models;
      },
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
   function zfill(str, count) {
      var zeros = count - str.toString().length;
      if (zeros <= 0) return str;
      var ret = Array(zeros+1).join("0") + str;
      return ret;
   }
   function renderItemNameList(cssclass, viewLink, englishPlural) {
      this.el.children().remove();
      var self = this;
      var filtered;
      if (this.options.searchResults != undefined) {
         var results = this.options.searchResults;
         filtered = this.model.filter(function(item) {
               return item.id in results;
            });
         filtered = _.sortBy(filtered, function(item) {
               var key = zfill(9999 - results[item.id], 4);
               return key + item.get("Name");
            });
      } else {
         filtered = this.model.toArray();
      }
         
      _.each(filtered, function(dish, idx) {
         var $li = $("<li><span class='ui-icon inline ui-icon-"+cssclass+"'></span></li>")
            .appendTo(self.el)
            .addClass(cssclass)
				.draggable({revert:true,helper:'clone'});
         var name = dish.get("Name");
         $("<a></a>")
               .appendTo($li)
               .text(name)
               [0].href = "#" + viewLink + "/" + dish.id;
			$li[0].model = dish;
      });
      if (filtered.length == 0) {
         var $li = $("<li>[No "+englishPlural+"]</li>")
            .appendTo(this.el)
      }
      return this;
   }
   window.DishListView = Backbone.View.extend({
      tagName : "ul",
      className : "dish-list",
      events : {
      },
      initialize: function() {
         this.el = $(this.el);
         _.bindAll(this, "render");
         this.model.bind('all', this.render);
      },
      render : function() {
         renderItemNameList.call(this, "dish", "viewDish", "dishes");
         return this;
      }
   })
   function parseTags() {
         var newTags = this.$newTags.val();
         if (newTags.length == 0)
            return
         this.$newTags.val("");
         var quote = -1;
         var c = 0;
         var nextTag = ""
         var curTags = {};
         this.model.tags.each(function(tag) {
            var w = tag.get("Word");
            curTags[w] = w;
         })
         while (c < newTags.length)
         {
            if (quote >= 0)
            {
               if (newTags[c] == '"')
               {
                  if (nextTag.length > 0)
                  {
                     if (! (nextTag in curTags)) {
                        var added = this.model.tags.create({Word:nextTag});
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
                     var added = this.model.tags.create({Word:nextTag});
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
               var added = this.model.tags.create({Word:nextTag});
            }
   }
   function renderTags($tags, tags) {
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
            [0].href = "#search/" + tag.get("Word") + "//";
         var $delTag = $("<span class='remove ui-icon ui-icon-close'></span>")
            .appendTo($tag)
            .click(function () {
                  tag.destroy();
               })
            .hide();
         $tag.hover(function() {
               $delTag.show();
            }, function() {
               $delTag.hide();
            });
      });
   }
   function renderPairings($pairings, pairings, collection) {
      $pairings.html("");
      if ((!pairings) || pairings.length == 0)
         return;
		var map = {};
      pairings.each(function(pairing, t) {
			var desc = pairing.get("Description");
			if (!(desc in map))
				map[desc] = []
			var item = collection.get(pairing.get("Other"));
			if (item)
				map[desc].push({other: item, pairing: pairing});
		});
      _.each(map, function(list, desc) {
			$("<div class='pairing-head'></div>")
				.text(desc)
				.appendTo($pairings);
			var $ul = $("<ul class='pairing-list'></ul>")
				.appendTo($pairings);
			_.each(list, function(pairing, p) {
         	var $pairing = $("<li class='pairing'><span class='ui-icon ui-icon-dish inline'></span></li>")
            	.appendTo($ul);
         	$("<a></a>")
            	.appendTo($pairing)
            	.text(pairing.other.get("Name"))
            	[0].href = "#viewDish/" + pairing.other.id;
         	var $delTag = $("<span class='remove ui-icon ui-icon-close'></span>")
            	.appendTo($pairing)
            	.click(function () {
                  	pairing.pairing.destroy();
               })
               .hide();
            $pairing.hover(function() {
                  $delTag.show();
               }, function() {
                  $delTag.hide();
               });
			});
      });
   }
	function addPairing (desc, other) {
		this.model.pairings.create({Other : other.id, Description : desc });
	}
	function newPairing(evt, ui) { 
		var other = ui.draggable[0].model;
		var self = this;
		var $dialog =$("<div></div>").appendTo(document.body);
		$dialog.text("For " + self.model.get("Name") + " and " + other.get("Name") + "?")
		$dialog.dialog({
			title : "What kind of suggestion?",
			modal: true,
			buttons : {
				Recommended : function() {
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
	}
   function toggleMenu() {
      var menu = Menus.getDraftMenu();
      var list = menu.get("Dishes");
      var added = false;
      if (menu.hasDish(this.model)) {
         for(var i in list) {
            if (list[i] == this.model.id) {
               list.splice(i, 1);
               break;
            }
         }
      } else {
         list.push(this.model.id);
         added = true;
      }
      menu.save({"Dishes": list});
      if (added) {
         App.viewMenu(menu);
      } else {
         this.render();
      }
   }
   window.DishEditView = Backbone.View.extend({
      tagName : "div",
      className : "dish-edit",
      events : {
        "change input" : "onChange",
        "autocompletechange input" : "onChange"
      },
      initialize: function() {
         this.el = $(this.el);
         this.dirty = 0;
         _.bindAll(this, "render");
         _.bindAll(this, "save");
         _.bindAll(this, "del");
         _.bindAll(this, "saveSuccess");
         _.bindAll(this, "saveError");
         _.bindAll(this, "onChange");
         _.bindAll(this, "newPairing");
         this.model.bind('all', this.render);
         this.model.ingredients.bind('all', this.render);
         this.model.tags.bind('all', this.render);
         this.model.pairings.bind('all', this.render);
         if (this.model.ingredients.url && this.model.ingredients.length == 0)
            this.model.ingredients.fetch();
         if (this.model.tags.url && this.model.tags.length == 0)
            this.model.tags.fetch();
         if (this.model.pairings.url)
            this.model.pairings.fetch();
         this.ingredients = { gen : 0};
         this.el.append("<span class='ui-icon ui-icon-dish inline large'></span>");
         this.$name = $("<input class='name ui-widget' type='text'></input>")
            .appendTo(this.el);
         this.el.append(" ");
         //  grey-out Save button when already saved (hasChanged == false)
         this.$save = $("<input class='save' type='button' value='Save'></input>")
            .button({disabled: true, label: "Saved"})
            .click(this.save)
            .appendTo(this.el);
         this.$delete = $("<input class='delete' type='button' value='Delete'></input>")
            .button()
            .click(this.del)
            .appendTo(this.el);
         this.el.append("<br/>");
         this.$error = $("<div class='error'></div>")
                        .hide()
                        .appendTo(this.el);
         this.el.append("<br/><span class='field-head'>Rating</span>: ");
         for (var i = 0; i < 5; i++)
         {
            var self = this;
            var $star = $("<span class='ui-icon ui-icon-star rating'></span>")
               .appendTo(this.el);
            (function (rating) {
               $star.click(function() {
                     self.model.set({"Rating": rating});
                  })
            }) (i+1);
         }
         this.$stars = this.el.find(".ui-icon-star");
         this.el.append("<br/><span class='field-head'>Source</span>: ");
         this.$source = $("<input type='text' size='75' class='ui-widget'></input>")
            .appendTo(this.el);
         this.el.append("<br/><span class='field-head'>Dish type</span>: ");
         this.$type = $("<input type='text'></input>")
            .appendTo(this.el)
            .autocomplete({source:["Entree", "Side", "Appetizer", "Dessert", "Drink"], minLength:0});
         makeCombo(this.$type);
         this.el.append("<br/><span class='field-head'>Prep time</span>: ");
         this.$prepTime = $("<input class='ui-widget' type='text'></input>")
            .appendTo(this.el);
         this.el.append(" minutes<br/><span class='field-head'>Cook time</span>: ");
         this.$cookTime = $("<input class='ui-widget' type='text'></input>")
            .appendTo(this.el);
         this.el.append(" minutes<br/><span class='field-head'>Tags</span>:<span class='ui-icon ui-icon-tag inline'></span>");
         this.$tags = $("<div class='tag-list'></div>")
            .appendTo(this.el);
         this.el.append("<br/>Type new tags, separated by commas<br/>");
         this.$newTags = $("<input type='text' class='ui-widget' width='40'></input>")
            .bind('keypress', function (evt) {
               if (evt.which == 13) {
                  evt.preventDefault();
                  self.parseTags()
               }
            })
            .appendTo(this.el);
         this.el.append("<br/><span class='field-head'>Ingredients [Amount, extra instructions (chopped, peeled, etc.)]</span>:");
         this.$mi = $("<table class='ingredients'><tr><th>Ingredient</th><th>Amount</th><th>Notes</th><th></th></tr></table>")
            .appendTo(this.el);
         var allIngredients = Ingredients.map(
               function(i) { return i.get("Name"); });
         var $lastRow = $("<tr></tr>")
            .appendTo(this.$mi);
         this.$addIngredient = $("<input class='ui-widget' type='text'></input>")
            .appendTo($lastRow)
            .autocomplete({source: allIngredients, minLength:0})
            .bind('keypress', function (evt) {
               if (evt.which == 13) {
                  evt.preventDefault();
                  self.addIngredient(false)
               }
            })
         makeCombo(this.$addIngredient);
			this.el.append("<span class='field-head'>Suggestions</span>"); 

         this.$pairings = $("<div class='pairing-list'></div>")
            .appendTo(this.el);
			this.$pairingsDrop = $("<div class='dish-drop ui-widget-content'>Drag dishes here to add a suggestion.</div>")
				.appendTo(this.el)
				.droppable({
					accept: ".dish",
					hoverClass : "ui-state-highlight drop-accept",
					drop: this.newPairing
				});
            
         if (!this.model.id)
            this.save();
      },
      render : function() {
         var self = this;
         if (this.dirty) {
            this.$save.button({disabled : false, label: "Save"}); 
         }
         this.$name.val(this.model.get("Name"));
			document.title = this.model.get("Name");
         this.$type.val(this.model.get("DishType"));
         this.$prepTime.val(this.model.get("PrepTimeMinutes"));
         this.$cookTime.val(this.model.get("CookTimeMinutes"));
         this.$source.val(this.model.get("Source"));
         var rating = this.model.get("Rating");
         for (var i = 0; i < 5; i ++)
         {
            if (rating >= (i+1))
               this.$stars.eq(i).removeClass("disabled");
            else
               this.$stars.eq(i).addClass("disabled");
         }
         var self = this;
         renderTags(this.$tags, this.model.tags);
         this.ingredients.gen++;
         var nextIngredients = {};
         this.model.ingredients.each(function(i) {
            var changed = false;
            var ing;
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
               $tr[0].id = i.id;
               ing.$name = $("<td></td>").appendTo($tr);
               ing.$amount = $("<td><input type='text' class='ui-widget'></input></td>")
                  .appendTo($tr)
                  .find("input");
               ing.$instruction = $("<td><input type='text' class='ui-widget'></input></td>")
                  .appendTo($tr)
                  .find("input");
               ing.$del = $("<td><span class='remove ui-icon ui-icon-close'></span></td>")
                  .appendTo($tr)
                  .click(function() {
                     var $tr = $(this).closest("tr");
                     var mi  = self.model.ingredients.get($tr[0].id);
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
               ing.$name.text(Ingredients.get(i.get("Ingredient")).get("Name"));
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
         renderPairings(this.$pairings, this.model.pairings,
				window.Dishes);
         return this;
      },
      focus : function() {
         this.$name.focus();
      },
		addPairing : addPairing,
		newPairing : newPairing,
      save : function() {
         if (this.dirty) {
            this.dirty = 1;
            this.$save.button({disabled : true, text : "Saving"}); 
            this.model.save( {},
               {
                  error : this.saveError,
                  success : this.saveSuccess
               });
            if (this.model.ingredients.url)
            {
               var self = this;
               this.model.ingredients.each(function(mi) {
                  mi.save( {},
                     {
                        error : self.saveError,
                        success : self.saveSuccess
                     });
                  });
            }
            if (this.model.tags.url)
            {
               var self = this;
               this.model.tags.each(function(mi) {
                  mi.save( {},
                     {
                        error : self.saveError,
                        success : self.saveSuccess
                     });
                  });
            }
         }
         else if (this.$error.is(":hidden"))
         {
            this.dirty = 1;
            this.saveSuccess()
         }
      },
      saveError : function(model, response) {
         this.$save.button({disabled : true, label : "Save Failed"}); 
         this.$error.text("Error: " + response);
         this.$error.show();
      },
      saveSuccess : function(model, response) {
         this.dirty--;
         this.$error.hide();
         this.$save.button({disabled : true, label : "Saved"}); 
      },
      del : function() {
         this.model.destroy();
         this.remove();
      },
      onChange : function() {
         this.dirty++;
         this.model.set({"Name": this.$name.val(),
            "DishType": this.$type.val(),
            "PrepTimeMinutes": parseInt(this.$prepTime.val()),
            "CookTimeMinutes": parseInt(this.$cookTime.val()),
            "Source": this.$source.val()
            });
         var $trs = this.$mi.find("tr.ingredient");
         for (var i = 0; i < $trs.length; i++)
         {
            var $tr = $($trs[i]);
            var id = $tr[0].id;
            var model = this.model.ingredients.get(id);
            var $amount = $tr.find("input").eq(0);
            var $instruction = $tr.find("input").eq(1);
            model.set({"Amount" : $amount.val(),
                        "Instruction" : $instruction.val()});
         }
         this.parseTags();
         this.addIngredient(true);
         this.$save.button({disabled : false, label: "Save"}); 
         setTimeout(this.save, 5000);
      },
      parseTags : parseTags,
      addIngredient : function(fromChangeHandler) {
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
            }
            if (!fromChangeHandler)
               this.onChange();
         }
      }
   })
   window.DishView = Backbone.View.extend({
      tagName : "div",
      className : "dish-view",
      initialize: function() {
         this.el = $(this.el);
         this.dirty = 0;
         _.bindAll(this, "render");
         _.bindAll(this, "del");
         _.bindAll(this, "edit");
         _.bindAll(this, "newPairing");
         _.bindAll(this, "toggleMenu");
         this.model.bind('all', this.render);
         this.model.tags.bind('all', this.render);
         this.model.ingredients.bind('all', this.render);
         this.model.pairings.bind('all', this.render);
         if (this.model.ingredients.url && this.model.ingredients.length == 0)
            this.model.ingredients.fetch();
         if (this.model.tags.url && this.model.tags.length == 0)
            this.model.tags.fetch();
         if (this.model.pairings.url)
            this.model.pairings.fetch();
         this.el.append("<span class='ui-icon ui-icon-dish inline large'></span>");
         this.$name = $("<span class='name'></span>")
            .appendTo(this.el);
         this.el.append(" ");
         this.$menu = $("<button value='menu' title='Add to menu'>&nbsp;</button>")
            .button({
               icons : {primary:'ui-icon-arrowthick-1-e', secondary:'ui-icon-menu'},
               text : false
            })
            .click(this.toggleMenu)
            .appendTo(this.el);
         this.$edit = $("<button class='edit' type='button' value='Edit' title='Edit Dish'></button>")
            .button({label: "Edit"})
            .click(this.edit)
            .appendTo(this.el);
         this.$delete = $("<button class='delete' value='Delete'  title='Delete Dish'></button>")
            .button({label:"Delete"})
            .click(this.del)
            .appendTo(this.el);
         this.el.append("<br/><span class='field-head'>Rating</span>: ");
         for (var i = 0; i < 5; i++)
         {
            var self = this;
            var $star = $("<span class='ui-icon ui-icon-star rating'></span>")
               .appendTo(this.el);
            (function (rating) {
               $star.click(function() {
                     self.model.save({"Rating": rating});
                  })
            }) (i+1);
         }
         this.$stars = this.el.find(".ui-icon-star");
         this.el.append("<br/><span class='field-head'>Source</span>: ");
         this.$source = $("<span class='dish-source'></span>")
            .appendTo(this.el);
         this.el.append("<br/><span class='field-head'>Dish type</span>: ");
         this.$type = $("<span class='dish-type'></span>")
            .appendTo(this.el);
         this.el.append("<br/><span class='field-head'>Prep time</span>: ");
         this.$prepTime = $("<span class='dish-time'></span>")
            .appendTo(this.el);
         this.el.append(" minutes<br/><span class='field-head'>Cook time</span>: ");
         this.$cookTime = $("<span class='dish-time'></span>")
            .appendTo(this.el);
         this.el.append(" minutes<br/><span class='field-head'>Tags</span>:<span class='ui-icon ui-icon-tag inline'></span>");
         this.$tags = $("<div class='tag-list'></div>")
            .appendTo(this.el);
         this.$mi = $("<table class='ingredients'><tr><th>Ingredient</th><th>Amount</th><th>Notes</th><th></th></tr></table>")
            .appendTo(this.el);
         var allIngredients = Ingredients.map(
               function(i) { return i.get("Name"); });
         var $lastRow = $("<tr></tr>")
            .appendTo(this.$mi);
			this.el.append("<span class='field-head'>Suggestions</span>"); 

         this.$pairings = $("<div class='pairing-list'></div>")
            .appendTo(this.el);
			this.$pairingsDrop = $("<div class='dish-drop ui-widget-content'>Drag dishes here to add a suggestion.</div>")
				.appendTo(this.el)
				.droppable({
					accept: ".dish",
					hoverClass : "ui-state-highlight drop-accept",
					drop: this.newPairing
				});
            
      },
      render : function() {
         var self = this;
         if (Menus.getDraftMenu().hasDish(this.model)) {
            this.$menu.addClass("menu-active");
            this.$menu.button("option", "icons", {primary:'ui-icon-arrowthick-1-w', secondary:'ui-icon-menu'});
         } else {
            this.$menu.removeClass("menu-active");
            this.$menu.button("option", "icons", {primary:'ui-icon-arrowthick-1-e', secondary:'ui-icon-menu'});
         }
         this.$name.text(this.model.get("Name"));
			document.title = this.model.get("Name");
         this.$type.text(this.model.get("DishType"));
         this.$prepTime.text(this.model.get("PrepTimeMinutes"));
         this.$cookTime.text(this.model.get("CookTimeMinutes"));
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
         var rating = this.model.get("Rating");
         for (var i = 0; i < 5; i ++)
         {
            if (rating >= (i+1))
               this.$stars.eq(i).removeClass("disabled");
            else
               this.$stars.eq(i).addClass("disabled");
         }
         renderTags(this.$tags, this.model.tags);
         var self = this;
         this.$mi.find("tr.ingredient").remove();
         this.model.ingredients.each(function(i) {
               var $tr = $("<tr class='ingredient'></tr>");
               $tr[0].id = i.id;
               var $name = $("<td><span class='ui-icon ui-icon-ingredient inline'></span></td>").appendTo($tr);
               var $amount = $("<td><span class='ingredient-amount'></span></td>")
                  .appendTo($tr)
                  .find("span");
               var $instruction = $("<td><span class='ingredient-instruction'></span></td>")
                  .appendTo($tr)
                  .find("span");
               $amount.text(i.get("Amount"));
               $instruction.text(i.get("Instruction"));
               var ingredient = Ingredients.get(i.get("Ingredient"));
               $("<a></a>")
                     .appendTo($name)
                     .text(ingredient.get("Name"))
                     [0].href = "#viewIngredient/" + ingredient.id;
               self.$mi.append($tr);
         });
         renderPairings(this.$pairings, this.model.pairings,
				window.Dishes);
         return this;
      },
      del : function() {
         this.model.destroy();
         this.remove();
      },
      edit: function(ev) {
         this.trigger("editDish", this.model);
      },
		addPairing : addPairing,
		newPairing : newPairing,
      toggleMenu : toggleMenu
   })
   window.IngredientListView = Backbone.View.extend({
      tagName : "ul",
      className : "ingredient-list",
      initialize: function() {
         this.el = $(this.el);
         _.bindAll(this, "render");
         this.model.bind('all', this.render);
      },
      render : function() {
         renderItemNameList.call(this, "ingredient", "viewIngredient", "ingredients");
         return this;
      },
   })
   window.IngredientEditView = Backbone.View.extend({
      tagName : "div",
      className : "ingredient-edit",
      events : {
        "change input" : "onChange",
        "autocompletechange input" : "onChange"
      },
      initialize: function() {
         var self = this;
         this.el = $(this.el);
         this.dirty = 0;
         _.bindAll(this, "render");
         _.bindAll(this, "save");
         _.bindAll(this, "del");
         _.bindAll(this, "saveSuccess");
         _.bindAll(this, "saveError");
         this.model.bind('all', this.render);
         this.model.tags.bind('all', this.render);
         if (this.model.tags.url && this.model.tags.length == 0)
            this.model.tags.fetch();
         this.el.append("<span class='ui-icon ui-icon-ingredient inline large'></span>");
         this.$name = $("<input class='name ui-widget' type='text'></input>")
            .appendTo(this.el);
         this.el.append(" ");
         //  grey-out Save button when already saved (hasChanged == false)
         this.$save = $("<input class='save' type='button' value='Save'></input>")
            .button({disabled: true, label: "Saved"})
            .click(this.save)
            .appendTo(this.el);
         this.$delete = $("<input class='delete' type='button' value='Delete'></input>")
            .button()
            .click(this.del)
            .appendTo(this.el);
         this.el.append("<br/>");
         this.$error = $("<div class='error'></div>")
                        .hide()
                        .appendTo(this.el);
         this.el.append("<br/><span class='field-head'>Category</span>: ");
         this.$category = $("<input class='ui-widget' type='text'></input>")
            .appendTo(this.el)
            .autocomplete({source:["Carbohydrate", "Protein", "Vegetable", "Fruit", "Sweet", "Spice", "Fat", "Herb"], minLength:0});
         makeCombo(this.$category);
         this.el.append("<br/><span class='field-head'>Source</span>: ");
         this.$source= $("<input ></input>")
            .autocomplete({source:["Animal", "Vegan", "Vegetarian"], minLength:0})
            .appendTo(this.el)
         makeCombo(this.$source);
         this.el.append("<br/><span class='field-head'>Tags</span>:<span class='ui-icon ui-icon-tag inline'></span>");
         this.$tags = $("<div class='tag-list'></div>")
            .appendTo(this.el);
         this.el.append("<br/>Type new tags, separated by commas<br/>");
         this.$newTags = $("<input type='text' class='ui-widget' width='40'></input>")
            .bind('keypress', function (evt) {
               if (evt.which == 13) {
                  evt.preventDefault();
                  self.parseTags(false)
               }
            })
            .appendTo(this.el);
         this.$name.focus();
      },
      render : function() {
         if (this.dirty) {
            this.$save.button({disabled : false, label: "Save"}); 
         }
         this.$name.val(this.model.get("Name"));
			document.title = this.model.get("Name");
         this.$category.val(this.model.get("Category"));
         this.$source.val(this.model.get("Source"));
         renderTags(this.$tags, this.model.tags);
         return this;
      },
      focus : function() {
         this.$name.focus();
      },
      save : function() {
         if (this.dirty) {
            this.dirty = 1;
            this.$save.button({disabled : true, text : "Saving"}); 
            this.model.save( {},
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
      saveError : function(model, response) {
         this.$save.button({disabled : true, label : "Save Failed"}); 
         this.$error.text("Error: " + response);
         this.$error.show();
      },
      saveSuccess : function(model, response) {
         this.dirty--;
         this.$error.hide();
         this.$save.button({disabled : true, label : "Saved"}); 
      },
      del : function() {
         this.model.destroy();
         this.remove();
      },
      onChange : function() {
         this.dirty++;
         this.model.set({"Name": this.$name.val(),
            "Category": this.$category.val(),
            "Source": this.$source.val()
            });
         this.parseTags(true)
         this.$save.button({disabled : false, label: "Save"}); 
         setTimeout(this.save, 5000);
      },
      parseTags : parseTags
   })
   window.IngredientView = Backbone.View.extend({
      tagName : "div",
      className : "ingredient-view",
      events : {
      },
      initialize: function() {
         var self = this;
         this.el = $(this.el);
         this.dirty = 0;
         _.bindAll(this, "render");
         _.bindAll(this, "del");
         _.bindAll(this, "edit");
         _.bindAll(this, "dishesReceived");
         _.bindAll(this, "viewDish");
         this.model.bind('all', this.render);
         this.model.tags.bind('all', this.render);
         if (this.model.tags.url && this.model.tags.length == 0)
            this.model.tags.fetch();
         this.el.append("<span class='ui-icon ui-icon-ingredient inline large'></span>");
         this.$name = $("<span class='name'></span>")
            .appendTo(this.el);
         this.el.append(" ");
         this.$edit = $("<input class='edit' type='button' value='Edit'></input>")
            .button({label: "Edit"})
            .click(this.edit)
            .appendTo(this.el);
         this.$delete = $("<input class='delete' type='button' value='Delete'></input>")
            .button()
            .click(this.del)
            .appendTo(this.el);
         this.el.append("<br/>");
         this.el.append("<br/><span class='field-head'>Category</span>: ");
         this.$category = $("<span></span>")
            .appendTo(this.el);
         this.el.append("<br/><span class='field-head'>Source</span>: ");
         this.$source= $("<span></span>")
            .appendTo(this.el)
         this.el.append("<br/><span class='field-head'>Tags</span>: <span class='ui-icon ui-icon-tag inline'></span>");
         this.$tags = $("<div class='tag-list'></div>")
            .appendTo(this.el);
         this.el.append("<br/><span class='field-head'>Dishes with this ingredient</span>:");
         this.$dishes = $("<div class='dishes'>Loading...</div>").appendTo(this.el);
         jQuery.getJSON(this.model.url() + "/in/", this.dishesReceived);
      },
      render : function() {
         this.$name.text(this.model.get("Name"));
			document.title = this.model.get("Name");
         this.$category.text(this.model.get("Category"));
         this.$source.text(this.model.get("Source"));
         renderTags(this.$tags, this.model.tags);
         return this;
      },
      del : function() {
         this.model.destroy();
         this.remove();
      },
      edit: function(ev) {
         this.trigger("editIngredient", this.model);
      },
      dishesReceived : function(dishIds) {
         this.$dishes.html("");
         var searchResults = {};
         _.each(dishIds, function(id) {
            searchResults[id] = 1;
         });
         this.dishListView = new DishListView({model : window.Dishes, searchResults : searchResults});
         this.dishListView.bind("selected", this.viewDish);
         this.$dishes.append(this.dishListView.render().el);
      },
      viewDish: function(ev) {
         this.trigger("viewDish", ev);
      },
   })
   window.MenuListView = Backbone.View.extend({
      tagName : "ul",
      className : "menu-list",
      initialize: function() {
         this.el = $(this.el);
         _.bindAll(this, "render");
         this.model.bind('all', this.render);
      },
      render : function() {
         renderItemNameList.call(this, "menu", "viewMenu", "menus");
         return this;
      },
   })
   window.MenuView = Backbone.View.extend({
      tagName : "div",
      className : "menu-view",
      initialize: function() {
         this.el = $(this.el);
         this.dirty = 0;
         _.bindAll(this, "render");
         _.bindAll(this, "del");
         _.bindAll(this, "clearMenu");
         _.bindAll(this, "cloneMenu");
         _.bindAll(this, "newDish");
         this.model.bind('all', this.render);
         this.el.append("<span class='ui-icon ui-icon-menu inline large'></span>");
         this.$name = $("<span class='name'></span>")
            .appendTo(this.el);
         this.el.append(" ");
         this.$delete = $("<button class='delete' value='Delete'  title='Delete Dish'></button>")
            .button({label:"Delete"})
            .click(this.del)
            .appendTo(this.el);
         this.$save = $("<button class='save' value='Save'  title='Save Menu'></button>")
            .button({label:"Save"})
            .click(this.cloneMenu)
            .appendTo(this.el)
            .hide();
         this.$clear = $("<button class='clear' value='Clear'  title='Clear Menu'></button>")
            .button({label:"Clear"})
            .click(this.clearMenu)
            .appendTo(this.el)
            .hide();
         this.$dishes = $("<ul class='dish-list'></ul>")
            .appendTo(this.el);
			this.$dishDrop = $("<div class='dish-drop ui-widget-content'>Drag dishes here to add to the menu.</div>")
				.appendTo(this.el)
				.droppable({
					accept: ".dish",
					hoverClass : "ui-state-highlight drop-accept",
					drop: this.newDish
				});
      },
      render : function() {
         var self = this;
         var name = this.model.get("Name");
         this.$name.text(name);
			document.title = name;
         if (this.model == Menus.getDraftMenu()) {
            this.$delete.hide();
            this.$save.show();
            this.$clear.show();
         }
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
         _.each(dishes, function(dish) {
               var $li = $("<li class='dish'><span class='ui-icon inline ui-icon-dish'></span></li>")
                  .appendTo(self.$dishes)
                  .draggable({revert:true,helper:'clone'});
               var name = dish.get("Name");
               $("<a></a>")
                     .appendTo($li)
                     .text(name)
                     [0].href = "#viewDish/" + dish.id;
			      $li[0].model = dish;
               var $delTag = $("<span class='remove ui-icon ui-icon-close'></span>")
                  .appendTo($li)
                  .click(function () {
                        self.model.removeDish(dish);
                        self.render();
                     })
                  .hide();
               $li.hover(function() {
                     $delTag.show();
                  }, function() {
                     $delTag.hide();
                  });
               
         });
         return this;
      },
      del : function() {
         this.model.destroy();
         this.remove();
      },
      edit: function(ev) {
         this.trigger("editDish", this.model);
      },
      clearMenu : function() {
         this.model.save({Dishes:[]});
         this.render();
      },
      cloneMenu : function() {
         var self = this;
         var $dialog = $("<div><input type='text' size='50'></input></div>")
            .appendTo(this.el)
            .dialog({
               modal: true,
               title: "Menu Name?",
               buttons : {
                  Save : function() {
                     var $input = $dialog.find("input");
                     if ($input.val().length > 0 &&
                         $input.val() != "<New Menu>")
                     {
                        var newMenu = Menus.create({Name:$input.val(),
                           Dishes:self.model.get("Dishes")});
					         $(this).dialog("close");
                        App.viewMenu(newMenu);
                     }
                  },
                  Cancel : function() {
					      $(this).dialog("close");
                  }
               }
               });
      },
      newDish : function(evt, ui) {
		   var other = ui.draggable[0].model;
         if (other && !this.model.hasDish(other)) {
            var dishes = this.model.get("Dishes");
            dishes.push(other.id);
            this.model.save({Dishes:dishes});
            this.render();
         }
      }
   })
   window.User = Backbone.Model.extend({
      
   });

   window.UserList = Backbone.Collection.extend({
      url: "/users",
      model: User
   })
   
   window.UserView = Backbone.View.extend({
      el : $("#user"),
      className : "user",
      initialize : function() {
         this.el = $(this.el);
         _.bindAll(this, "render");
         this.model.bind('all', this.render);
      },
      render : function() {
         if (this.model.length > 0) {
            var user = this.model.at(0);
            this.el.text(user.get("Name"));
            this.el.append(" ");
            $("<a>Sign out</a>")
               .addClass("signout")
               .button()
               .attr("href", user.get("logoutURL"))
               .appendTo(this.el);
         }
         return this;
      }
   })
   window.LoadingView = Backbone.View.extend({
      tagName : "div",
      className : "search-view",
      initialize : function() {
         this.el = $(this.el);
         this.el.text("Loading...");
      },
      render : function() {
         return this;
      }
      });

   window.Search = Backbone.Model.extend({
      
   });
   window.SearchView = Backbone.View.extend({
      tagName : "div",
      className : "search-view",
      initialize : function() {
         this.el = $(this.el);
         _.bindAll(this, "startSearch");
         _.bindAll(this, "render");
         _.bindAll(this, "searchComplete");
         _.bindAll(this, "dishSelected");
         _.bindAll(this, "ingredientSelected");
         this.model.bind('change', this.startSearch);
         this.startSearch();
      },
      startSearch : function() {
         jQuery.post("/search", JSON.stringify(this.model.attributes), this.searchComplete);
      },
      searchComplete :  function(results) {
         if (! ("Dish" in results)) {
            results.Dish = {};
         }
         if (! ("Ingredient" in results)) {
            results.Ingredient = {};
         }
         this.dishListView = new DishListView({model : window.Dishes, searchResults: results["Dish"]});
         this.dishListView.bind("selected", this.dishSelected)
         this.ingredientListView = new IngredientListView({model : window.Ingredients, searchResults:results["Ingredient"]});
         this.ingredientListView.bind("selected", this.ingredientSelected)
         this.render();
      },
      render : function() {
         this.el.html("");
         if (this.dishListView || this.ingredientListView) {
            this.el.append("<div class='field-head'>Dishes</div>");
            if (this.dishListView)
               this.el.append(this.dishListView.render().el);
            this.el.append("<div class='field-head'>Ingredients</div>");
            if (this.ingredientListView)
               this.el.append(this.ingredientListView.render().el);
         } else {
            this.el.html("Searching...");
         }
         return this;
      },
      dishSelected : function(dish) {
         this.trigger('selecteddish', dish);
      },
      ingredientSelected : function(dish) {
         this.trigger('selectedingredient', dish);
      }
   })

   window.Users = new UserList
   window.Dishes = new DishList
   window.Ingredients = new IngredientList
   window.Menus = new MenuList
   var Router = Backbone.Router.extend({
      routes: {
         "viewDish/:id": "viewDish",
         "editDish/:id": "editDish",
         "viewIngredient/:id": "viewIngredient",
         "editIngredient/:id": "editIngredient",
         "viewMenu/:id": "viewMenu",
         "search/:tag/:word/:rating": "search",
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
   window.AppView = Backbone.View.extend({
      el : $("#app"),
      events : {
         "click #doSearch":   "textSearch",
      },
      initialize : function() {
         _.bindAll(this, "render");
         _.bindAll(this, "newDish");
         _.bindAll(this, "editDish");
         _.bindAll(this, "viewDish");
         _.bindAll(this, "newIngredient");
         _.bindAll(this, "viewIngredient");
         _.bindAll(this, "editIngredient");
         _.bindAll(this, "viewMenu");
         _.bindAll(this, "renderTags");
         _.bindAll(this, "restore");
         _.bindAll(this, "onFetched");
         _.bindAll(this, "textSearch");
         this.userView = new UserView({model : Users});
         this.dishListView = new DishListView({model : Dishes});
         this.dishListView.bind("selected", this.viewDish);
         this.mainView = null;
         var self = this;
         $("#doSearch").button();
         $("#search")
            .bind('keypress', function (evt) {
               if (evt.which == 13) {
                  evt.preventDefault();
                  self.textSearch();
               }
            });
         $("#dishes").append(this.dishListView.render().el);
         this.el.find(".add-dish")
                  .button()
                  .click(this.newDish);
         this.ingredientListView = new IngredientListView({model : Ingredients});
         this.ingredientListView.bind("selected", this.viewIngredient);
         $("#ingredients").append(this.ingredientListView.render().el);
         this.menuListView = new MenuListView({model: Menus});
         $("#menu-tab").append(this.menuListView.render().el);
         this.el.find(".add-ingredient")
                  .button()
                  .click(this.newIngredient);
			$("#restore-file").change(this.restore);
         $("#side-tabs").tabs({
         });
         this.fetched = 0;
         this.show(new LoadingView());
         Menus.fetch({success:this.onFetched, error:this.onFetched});
         Users.fetch({success:this.onFetched, error:this.onFetched});
         Dishes.fetch({success:this.onFetched, error:this.onFetched});
         Ingredients.fetch({success:this.onFetched, error:this.onFetched});
         jQuery.getJSON("/tags", this.renderTags);
      },
      onFetched : function() {
         this.fetched++;
         if (this.fetched == 4) {
            this.show(null);
            Backbone.history || (Backbone.history = new Backbone.History);
            Backbone.history.start();
         }
      },
      render : function() {
         this.userView.render();
         return this
      },
      renderTags : function(tags) {
         var $tags = $("#tags");
         for (var tag in tags)
         {
            var $li = $("<li class='tag'></li>")
               .appendTo($tags);
            $("<a></a>")
               .appendTo($li)
               .text(tags[tag])
               [0].href = "#search/" + tags[tag] + "//";
         }
      },
      show : function(view) {
         if (this.mainView)
            this.mainView.remove();
         if (view == null)
         {
            this.mainView = null;
            return;
         }
         view.bind("viewDish", this.viewDish);
         view.bind("viewIngredient", this.viewIngredient);
         view.bind("editDish", this.editDish);
         view.bind("editIngredient", this.editIngredient);
         this.mainView = view;
         $(window).scrollTop(0);
         $("#main").append(view.render().el);
         if (view.focus)
            view.focus();
      },
      textSearch : function() {
         this.search(new Search({Word: $("#search").val()}));
      },
      search : function (search) {
         $("#side-tabs").tabs('select', 0);
			var words = "";
			if (search.get("Word"))
				words = search.get("Word");
			if (search.get("Tags"))
				words = search.get("Tags").reduce(function(prevValue, curValue, index, array) {
					return prevValue + " " + curValue;
				}, words)
			$("#search").val(words)
         var searchView = new SearchView({ model: search });
         searchView.bind("selecteddish", this.viewDish);
         searchView.bind("selectedingredient", this.viewIngredient);
			$("#search-results").html("")
				.append(searchView.render().el);
         var tags = "";
         if (search.get("Tags") && search.get("Tags").length > 0)
            tags = search.get("Tags")[0];
         var word = "";
         if (search.get("Word"))
            word = search.get("Word");
         var rating = "";
         if (search.get("Rating"))
            name = search.get("Rating");
         window.Workspace.navigate("search/" + tags + "/" + word + "/" + rating);
      },
      newDish : function() {
         var nd = Dishes.create({});
         this.editDish(nd)
      },
      viewDish : function(dish) {
         var viewDish = new DishView({model : dish})
         viewDish.bind("edit", this.editDish);
         this.show(viewDish);
         window.Workspace.navigate("viewDish/" + dish.id);
      },
      editDish : function(dish) {
         var editDishView = new DishEditView({model : dish})
         this.show(editDishView);
         window.Workspace.navigate("editDish/" + dish.id);
      },
      newIngredient : function() {
         var nd = Ingredients.create({});
         this.editIngredient(nd)
      },
      viewIngredient : function(ingredient) {
         var viewIngredient = new IngredientView({model : ingredient})
         viewIngredient.bind("edit", this.editIngredient);
         this.show(viewIngredient);
         window.Workspace.navigate("viewIngredient/" + ingredient.id);
      },
      viewMenu : function(model) {
         var viewMenu = new MenuView({model : model})
         this.show(viewMenu);
         window.Workspace.navigate("viewMenu/" + model.id);
      },
      editIngredient : function(ingredient) {
         var editIngredientView = new IngredientEditView({model : ingredient})
         this.show(editIngredientView);
         window.Workspace.navigate("editIngredient/" + ingredient.id);
      },
		restore : function() {
			$("#restore-form").submit();
		}
   })

   window.App = new AppView;
})

