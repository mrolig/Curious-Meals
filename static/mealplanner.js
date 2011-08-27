jQuery(function() {
   "use strict";
   window.Dish = Backbone.Model.extend({
      validate: function(attrs) {
         if (len(attrs.Name) == 0)
            return "Must give your dish a name";
      },
      defaults : {
         Name : "<New Dish>",
         DishType : "",
         Ingredients : [],
         Tags : [],
         PrepTimeMinutes : 0,
         CookTimeMinutes : 0,
         Rating : 0
      }
   });
   window.DishList = Backbone.Collection.extend({
      url: "/dish",
      model: Dish,
      comparator : function(dish) {
         return dish.get("Name");
      }
   })
   window.DishListView = Backbone.View.extend({
      tagName : "ul",
      className : "dish-list",
      initialize: function() {
         this.el = $(this.el);
         _.bindAll(this, "render");
         this.model.bind('all', this.render);
      },
      render : function() {
         this.el.children().remove();
         var self = this;
         this.model.each(function(dish, idx) {
            $("<li></li>")
               .appendTo(self.el)
               .text(dish.get("Name"));
         });
         return this;
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
         this.userView = new UserView({model : Users});
         this.dishListView = new DishListView({model : Dishes});
         $("#dishes").append(this.dishListView.render().el);
         Users.fetch();
         Dishes.fetch();
         this.el.find(".add-dish")
                  .button()
                  .click(this.newDish);
      },
      render : function() {
         this.userView.render();
         return this
      },
      newDish : function() {
         Dishes.create({})
      }
   })

   window.App = new AppView;
})

