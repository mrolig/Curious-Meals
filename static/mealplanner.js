jQuery(function() {
   "use strict";
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
            this.el.html(user.get("name"));
            this.el.append(" ");
            $("<a>Sign out</a>")
               .addClass("signout")
               .attr("href", user.get("logoutURL"))
               .appendTo(this.el);
         }
      }
   })

   window.Users = new UserList
   window.AppView = Backbone.View.extend({
      el : $("#app"),
      initialize : function() {
         this.userView = new UserView({model : Users});
         Users.fetch();
         
      },
      render : function() {
         this.userView.render();
      }
   })

   window.App = new AppView;
})

