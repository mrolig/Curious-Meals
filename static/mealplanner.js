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
      },
      validate: function(attrs) {
         if (attrs.Name && attrs.Name.length == 0)
            return "Must give your dish a name";
         if (attrs.PrepTimeMin && attrs.PrepTimeMin == NaN)
            return "Must give prep time in minutes";
         if (attrs.CookTimeMin && attrs.CookTimeMin == NaN)
            return "Must give cook time in minutes";
      },
      defaults : {
         Name : "<New Dish>",
         DishType : "",
         Tags : [],
         PrepTimeMinutes : 0,
         CookTimeMinutes : 0,
         Rating : 0
      },
      parse : function(response) {
         var attrs = Backbone.Model.prototype.parse.call(this, response);
         attrs.id = attrs.Id;
         if (attrs.id)
            this.ingredients.url = "/dish/" + attrs.id + "/mi/";
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
      validate: function(attrs) {
         if (attrs.Name && attrs.Name.length == 0)
            return "Must give your ingredient a name";
      },
      defaults : {
         Name : "<New Ingredient>",
         Category : "",
         Source : "Animal",
         Tags : []
      },
      parse : function(response) {
         var attrs = Backbone.Model.prototype.parse.call(this, response);
         attrs.id = attrs.Id;
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
   window.DishListView = Backbone.View.extend({
      tagName : "ul",
      className : "dish-list",
      events : {
         "click .dish" : "selectDish"
      },
      initialize: function() {
         this.el = $(this.el);
         _.bindAll(this, "render");
         _.bindAll(this, "selectDish");
         this.model.bind('all', this.render);
      },
      render : function() {
         this.el.children().remove();
         var self = this;
         this.model.each(function(dish, idx) {
            var $li = $("<li></li>")
               .appendTo(self.el)
               .addClass("dish")
               .text(dish.get("Name"));
            $li[0].model = dish;
         });
         return this;
      },
      selectDish : function(ev) {
         this.trigger('selected', ev.currentTarget.model);
      }
   })
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
         this.model.bind('all', this.render);
         this.model.ingredients.bind('all', this.render);
         if (this.model.ingredients.url)
            this.model.ingredients.fetch();
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
         this.el.append("<br/>Rating: ");
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
         this.el.append("<br/>Dish type: ");
         this.$type = $("<input type='text'></input>")
            .appendTo(this.el)
            .autocomplete({source:["Entree", "Side", "Appetizer", "Dessert", "Drink"], minLength:0});
         makeCombo(this.$type);
         this.el.append("<br/>Prep time: ");
         this.$prepTime = $("<input class='ui-widget' type='text'></input>")
            .appendTo(this.el);
         this.el.append(" minutes<br/>Cook time: ");
         this.$cookTime = $("<input class='ui-widget' type='text'></input>")
            .appendTo(this.el);
         this.el.append(" minutes<br/>Tags:");
         this.$tags = $("<div></div>")
            .appendTo(this.el);
         this.el.append("Type new tags, separated by commas<br/>");
         this.$newTags = $("<input type='text' class='ui-widget' width='40'></input>")
            .bind('keypress', function (evt) {
               if (evt.which == 13) {
                  evt.preventDefault();
                  self.parseTags(false)
               }
            })
            .appendTo(this.el);
         this.el.append("<br/>Ingredients:");
         this.$mi = $("<div></div>")
            .appendTo(this.el);
         var allIngredients = Ingredients.map(
               function(i) { return i.get("Name"); });
         this.$addIngredient = $("<input class='ui-widget' type='text'></input>")
            .appendTo(this.el)
            .autocomplete({source: allIngredients, minLength:0})
            .bind('keypress', function (evt) {
               if (evt.which == 13) {
                  evt.preventDefault();
                  self.addIngredient(false)
               }
            })
         makeCombo(this.$addIngredient);
            
         this.$name.focus();
         if (!this.model.id)
            this.save();
      },
      render : function() {
         var self = this;
         if (this.dirty) {
            this.$save.button({disabled : false, label: "Save"}); 
         }
         this.$name.val(this.model.get("Name"));
         this.$type.val(this.model.get("DishType"));
         this.$prepTime.val(this.model.get("PrepTimeMinutes"));
         this.$cookTime.val(this.model.get("CookTimeMinutes"));
         var rating = this.model.get("Rating");
         for (var i = 0; i < 5; i ++)
         {
            if (rating >= (i+1))
               this.$stars.eq(i).removeClass("disabled");
            else
               this.$stars.eq(i).addClass("disabled");
         }
         this.$tags.html("");
         var tags = this.model.get("Tags");
         if ((!tags) || tags.length == 0)
            this.$tags.append("[none]");
         for (var t in tags)
         {
            if (t > 0)
               this.$tags.append(", ");
            var $tag = $("<div class='tag'></div>")
               .text(tags[t])
               .appendTo(this.$tags);
            (function (tag) {
            var $delTag = $("<span class='remove ui-icon ui-icon-close'></span>")
               .appendTo($tag)
               .click(function () {
                     var tags = self.model.get("Tags");
                     var i = tags.indexOf(tag);
                     if (i >= 0)
                     {
                        tags.splice(i, 1)
                        self.model.set({Tags:tags});
                        self.model.change();
                        self.onChange();
                     }
                     
                  });
            }) (tags[t]);
         }
         this.$mi.html("");
         this.model.ingredients.each(function(i) {
            self.$mi.append(document.createTextNode(Ingredients.get(i.get("Ingredient")).get("Name")), "<br/>");
         });
         return this;
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
            "DishType": this.$type.val(),
            "PrepTimeMinutes": parseInt(this.$prepTime.val()),
            "CookTimeMinutes": parseInt(this.$cookTime.val())
            });
         this.parseTags(true);
         this.addIngredient(true);
         this.$save.button({disabled : false, label: "Save"}); 
         setTimeout(this.save, 5000);
      },
      parseTags : function(fromChangeHandler) {
         var newTags = this.$newTags.val();
         if (newTags.length == 0)
            return
         this.$newTags.val("");
         var quote = -1;
         var c = 0;
         var nextTag = ""
         var tags = this.model.get("Tags");
         while (c < newTags.length)
         {
            if (quote >= 0)
            {
               if (newTags[c] == '"')
               {
                  if (nextTag.length > 0)
                  {
                     if (tags.indexOf(nextTag) == -1 ) {
                        tags.push(nextTag);
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
                  if (tags.indexOf(nextTag) == -1 ) {
                     tags.push(nextTag);
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
            if (tags.indexOf(nextTag) == -1 ) {
               tags.push(nextTag);
            }
         this.dirty++;
         this.model.set({Tags:tags});
         this.model.change();
         if (!fromChangeHandler)
            this.onChange();
      },
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
   window.IngredientListView = Backbone.View.extend({
      tagName : "ul",
      className : "ingredient-list",
      events : {
         "click .ingredient" : "selectIngredient"
      },
      initialize: function() {
         this.el = $(this.el);
         _.bindAll(this, "render");
         _.bindAll(this, "selectIngredient");
         this.model.bind('all', this.render);
      },
      render : function() {
         this.el.children().remove();
         var self = this;
         this.model.each(function(ingredient, idx) {
            var $li = $("<li></li>")
               .appendTo(self.el)
               .addClass("ingredient")
               .text(ingredient.get("Name"));
            $li[0].model = ingredient;
         });
         return this;
      },
      selectIngredient : function(ev) {
         this.trigger('selected', ev.currentTarget.model);
      }
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
         this.el.append("<br/>Category: ");
         this.$category = $("<input class='ui-widget' type='text'></input>")
            .appendTo(this.el)
            .autocomplete({source:["Carbohydrate", "Protein", "Veggetable", "Fruit", "Sweet", "Spice", "Fat"], minLength:0});
         makeCombo(this.$category);
         this.el.append("<br/>Source: ");
         this.$source= $("<input ></input>")
            .autocomplete({source:["Animal", "Vegan", "Vegetarian"], minLength:0})
            .appendTo(this.el)
         makeCombo(this.$source);
         this.el.append("<br/>Tags:");
         this.$tags = $("<div></div>")
            .appendTo(this.el);
         this.el.append("Type new tags, separated by commas<br/>");
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
         this.$category.val(this.model.get("Category"));
         this.$source.val(this.model.get("Source"));
         this.$tags.html("");
         var tags = this.model.get("Tags");
         if ((!tags) || tags.length == 0)
            this.$tags.append("[none]");
         for (var t in tags)
         {
            if (t > 0)
               this.$tags.append(", ");
            var self = this;
            var $tag = $("<div class='tag'></div>")
               .text(tags[t])
               .appendTo(this.$tags);
            (function (tag) {
            var $delTag = $("<span class='remove ui-icon ui-icon-close'></span>")
               .appendTo($tag)
               .click(function () {
                     var tags = self.model.get("Tags");
                     var i = tags.indexOf(tag);
                     if (i >= 0)
                     {
                        tags.splice(i, 1)
                        self.model.set({Tags:tags});
                        self.model.change();
                        self.onChange();
                     }
                     
                  });
            }) (tags[t]);
         }
         return this;
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
            if (this.model.ingredients.url)
               this.ingredients.save( {},
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
         this.model.set({"Name": this.$name.val(),
            "Category": this.$category.val(),
            "Source": this.$source.val()
            });
         this.parseTags(true)
         this.$save.button({disabled : false, label: "Save"}); 
         setTimeout(this.save, 5000);
      },
      parseTags : function(fromChangeHandler) {
         var newTags = this.$newTags.val();
         if (newTags.length == 0)
            return
         this.$newTags.val("");
         var quote = -1;
         var c = 0;
         var nextTag = ""
         var tags = this.model.get("Tags");
         while (c < newTags.length)
         {
            if (quote >= 0)
            {
               if (newTags[c] == '"')
               {
                  if (nextTag.length > 0)
                  {
                     if (tags.indexOf(nextTag) == -1 ) {
                        tags.push(nextTag);
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
                  if (tags.indexOf(nextTag) == -1 ) {
                     tags.push(nextTag);
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
            if (tags.indexOf(nextTag) == -1 ) {
               tags.push(nextTag);
            }
         this.model.set({Tags:tags});
         this.model.change();
         if (!fromChangeHandler)
            this.onChange();
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

   window.Users = new UserList
   window.Dishes = new DishList
   window.Ingredients = new IngredientList
   window.AppView = Backbone.View.extend({
      el : $("#app"),
      initialize : function() {
         _.bindAll(this, "render");
         _.bindAll(this, "newDish");
         _.bindAll(this, "editDish");
         _.bindAll(this, "newIngredient");
         _.bindAll(this, "editIngredient");
         _.bindAll(this, "onResize");
         this.userView = new UserView({model : Users});
         this.dishListView = new DishListView({model : Dishes});
         this.dishListView.bind("selected", this.editDish);
         this.dishEditView = null;
         $("#dishes").append(this.dishListView.render().el);
         this.el.find(".add-dish")
                  .button()
                  .click(this.newDish);
         this.ingredientListView = new IngredientListView({model : Ingredients});
         this.ingredientListView.bind("selected", this.editIngredient);
         this.ingredeintEditView = null;
         $("#ingredients").append(this.ingredientListView.render().el);
         this.el.find(".add-ingredient")
                  .button()
                  .click(this.newIngredient);
         $(window).resize(this.onResize);
         this.onResize();
         Users.fetch();
         Dishes.fetch();
         Ingredients.fetch();
      },
      render : function() {
         this.userView.render();
         this.onResize();
         return this
      },
      newDish : function() {
         var nd = Dishes.create({});
         this.editDish(nd)
      },
      editDish : function(dish) {
         if (this.dishEditView)
            this.dishEditView.remove();
         if (this.ingredientEditView)
            this.ingredientEditView.remove();
         this.dishEditView = new DishEditView({model : dish})
         this.el.find(".edit").append(this.dishEditView.render().el);
      },
      newIngredient : function() {
         var nd = Ingredients.create({});
         this.editIngredient(nd)
      },
      editIngredient : function(ingredient) {
         if (this.dishEditView)
            this.dishEditView.remove();
         if (this.ingredientEditView)
            this.ingredientEditView.remove();
         this.ingredientEditView = new IngredientEditView({model : ingredient})
         this.el.find(".edit").append(this.ingredientEditView.render().el);
      },
      onResize : function() {
         var height = $(document.body).height();
         var winHeight = $(window).height();
         if (winHeight > height)
            height = winHeight;
         if (height > 0) {
            this.el.find(".sidebar").height(height);
         }
      }
   })

   window.App = new AppView;
})

