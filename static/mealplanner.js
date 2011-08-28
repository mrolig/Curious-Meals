jQuery(function() {
   "use strict";
   window.Dish = Backbone.Model.extend({
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
         Ingredients : [],
         Tags : [],
         PrepTimeMinutes : 0,
         CookTimeMinutes : 0,
         Rating : 0
      },
      parse : function(response) {
         var attrs = Backbone.Model.prototype.parse.call(this, response);
         attrs.id = attrs.Id;
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
        "change input" : "onChange"
      },
      initialize: function() {
         this.el = $(this.el);
         _.bindAll(this, "render");
         _.bindAll(this, "save");
         _.bindAll(this, "del");
         _.bindAll(this, "saveSuccess");
         _.bindAll(this, "saveError");
         this.model.bind('all', this.render);
         this.$name = $("<input class='name' type='text'></input>")
            .appendTo(this.el);
         /*this.el.append(" ");
         this.$id= $("<input type='text'></input>")
            .appendTo(this.el);*/
         this.el.append(" ");
         // TODO automatically save X sec. after a change
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
            .autocomplete({source:["Entree", "Side", "Appetizer", "Dessert", "Drink"]});
         this.el.append("<br/>Prep time: ");
         this.$prepTime = $("<input type='text'></input>")
            .appendTo(this.el);
         this.el.append(" minutes<br/>Cook time: ");
         this.$cookTime = $("<input type='text'></input>")
            .appendTo(this.el);
         this.el.append(" minutes<br/>Tags:<br/>(TODO)");
         this.el.append("<br/>Ingredients:<br/>(TODO)");
         this.$name.focus();
      },
      render : function() {
         if (this.model.hasChanged())
         {
            this.onChange();
         }
         //this.$id.val(this.model.id);
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
         return this;
      },
      save : function() {
         this.$save.button({disabled : true, text : "Saving"}); 
         this.model.save( {"Name": this.$name.val(),
            "DishType": this.$type.val(),
            "PrepTimeMinutes": parseInt(this.$prepTime.val()),
            "CookTimeMinutes": parseInt(this.$cookTime.val())
            },
            {
               error : this.saveError,
               success : this.saveSuccess
            });
      },
      saveError : function(model, response) {
         this.$save.button({disabled : true, label : "Save Failed"}); 
         this.$error.text("Error: " + response);
         this.$error.show();
      },
      saveSuccess : function(model, response) {
         this.$error.hide();
         this.$save.button({disabled : true, label : "Saved"}); 
      },
      del : function() {
         this.model.destroy();
         this.remove();
      },
      onChange : function() {
         this.$save.button({disabled : false, label: "Save"}); 
         setTimeout(this.save, 5000);
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
   window.AppView = Backbone.View.extend({
      el : $("#app"),
      initialize : function() {
         _.bindAll(this, "render");
         _.bindAll(this, "newDish");
         _.bindAll(this, "editDish");
         _.bindAll(this, "onResize");
         this.userView = new UserView({model : Users});
         this.dishListView = new DishListView({model : Dishes});
         this.dishListView.bind("selected", this.editDish);
         this.dishEditView = null;
         $("#dishes").append(this.dishListView.render().el);
         Users.fetch();
         Dishes.fetch();
         this.el.find(".add-dish")
                  .button()
                  .click(this.newDish);
         $(window).resize(this.onResize);
         this.onResize();
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
         this.dishEditView = new DishEditView({model : dish})
         this.el.find(".edit").append(this.dishEditView.render().el);
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

