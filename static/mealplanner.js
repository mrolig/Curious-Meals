google.load("visualization", "1", {packages:["corechart"]});
(function($) {
   // make the element hide when the specified container element is hovered
   $.fn.autoHide = function(options) {
      if (options.handle) {
         // start hidden
         this.hide();
         // unhide when the handle hovers
         options.handle.hover(function() {
            this.show();
         }.bind(this), function() {
            this.hide();
         }.bind(this));
      }
      return this;
   }
   $.fn.hoverView = function(options) {
      this.addClass('hover-view');
      this.addClass('ui-widget-content');
      this.css("left", options.left);
      this.css("top", options.top);
      return this; 
   }
   $.fn.appendNew = function(tag, attributes, content) {
      var $new = $.make(tag, attributes, content);
      this.append($new);
      return this;
   }
   $.make = function(tag, attributes, content) {
      var $e = $(document.createElement(tag));
      if (attributes) {
         if (typeof(attributes) == "string") {
            $e.html(attributes)
         } else {
            $e.attr(attributes);
         }
      }
      if (content) $e.html(content);
      return $e;
   }
   // do 'default' stying to a text input
   $.fn.textInput = function(options) {
      var defaults = { size: 20 };
      var options = $.extend(defaults, options);
      this.addClass("ui-widget");
      var self = this;
      // select content when focused
      this.focus(function() {
         setTimeout(function() {
            self.select()
         }, 10);
      });
      this.attr("size", options.size);
      return this;
   }
   $.fn.combo = function (options) {
      options.minLength = 0;
      this.autocomplete(options)
         .addClass("ui-widget")
         .addClass("ui-combo")
         .css("margin-right", 0);
      this.each(function(index, autocomplete) {
         var $autocomplete = $(autocomplete);

         $("<div></div>")
            .insertAfter(this)
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
      });
      return this;
   }
   $.zfill = function (str, count) {
      var zeros = count - str.toString().length;
      if (zeros <= 0) return str;
      var ret = Array(zeros+1).join("0") + str;
      return ret;
   }
    
})(jQuery);

jQuery(function() {
   "use strict";
   window.MealplannerModel = Backbone.Model.extend({
      // override parse, so that we can copy the "Id" to "id"
      //  Go has to use upper case and backbone needs lower case
      parse : function(response) {
         var attrs = Backbone.Model.prototype.parse.call(this, response);
         attrs.id = attrs.Id;
         this.setCollectionURLs(attrs.id);
         return attrs;
      },
      setCollectionURLs : function(id) {
         if (id && this.collectionURLs)
         {
            for(var name in this.collectionURLs) {
               this[name].url = this.url() + "/" + this.collectionURLs[name] + "/";
            }
         }
      }
   });
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
      fetch : function(options) {
         if ((!jQuery.isFunction(this.url)) || this.url()) {
            this.fetchCalled = true;
         }
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
   window.Word = MealplannerModel.extend({
      defaults : {
         Word : ""
      }
   });
   window.WordList = MealplannerCollection.extend({
      model: Word,
      comparator : function(mi) {
         return mi.get("Word");
      }
   })
   window.Pairing = MealplannerModel.extend({
      defaults : {
         Other : "",
			Description : ""
      }
   });
   window.PairingList = MealplannerCollection.extend({
      model: Pairing
   })
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
      }
   })
   window.Dish = MealplannerModel.extend({
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
      collectionURLs : {
         "ingredients" : "mi",
         "tags" : "tags",
         "pairings" : "pairing"
      }
   });
   window.DishList = MealplannerCollection.extend({
      url: "/dish/",
      model: Dish,
      comparator : function(dish) {
         return dish.get("Name");
      }
   })
   window.Ingredient = MealplannerModel.extend({
      initialize: function() {
         this.tags = new WordList;
         this.setCollectionURLs(this.id);
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
      collectionURLs : {
         "tags" : "tags"
      }
   });
   window.IngredientList = MealplannerCollection.extend({
      url: "/ingredient/",
      model: Ingredient,
      comparator : function(ingredient) {
         return ingredient.get("Name");
      }
   })
   window.Menu = MealplannerModel.extend({
      defaults : {
			Name : "<New Menu>",
         Dishes : []
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
   window.MenuList = MealplannerCollection.extend({
      url: "/menu/",
      model: Menu,
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
   window.MealplannerView = Backbone.View.extend({
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
         this.el = $(this.el);
         this.dirty = 0;
         _.bindAll(this, "render");
         _.bindAll(this, "onChange");
         _.bindAll(this, "save");
         _.bindAll(this, "saveSuccess");
         _.bindAll(this, "saveError");
         _.bindAll(this, "del");
         this.model.bind('error', this.saveError);
         this.model.bind('all', this.render);
      },
      createBasicView : function () {
         this.$title = $.make("div", {class:"title"})
            .appendTo(this.el);
         if (this.icon) {
            this.makeIcon(this.icon, true)
               .appendTo(this.$title);
         }
         this.$name = $.make("span", {class:"name"})
            .appendTo(this.$title);
         this.$title.append(" ");
         if (this.buttons && !this.options.readOnly) {
            this.$buttons = $.make("span", {class:"buttons"})
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
         this.$fields = $.make("div", {class:"fields"})
            .appendTo(this.el);
      },
      makeIcon : function(iconClass, large) {
         var $icon = $.make("span")
            .addClass("ui-icon")
            .addClass("inline")
            .addClass(iconClass);
         if (large) {
            $icon.addClass("large")
         }
         return $icon;
      },
      newField : function(name, icon) {
         var $field = $.make("div", {class: "field" } )
            .appendTo(this.$fields);
         if (name) {
            $.make("span", {class: "field-head"})
               .text(name)
               .appendTo($field);
            $field.append(": ");
         }
         if (icon) {
            this.makeIcon(icon)
               .appendTo($field);
         }
         return $field;
      },
      newRatingField : function () {
         var $starField = this.newField("Rating");
         for (var i = 0; i < 5; i++)
         {
            var self = this;
            var $star = $("<span class='ui-icon ui-icon-star rating'></span>")
               .appendTo($starField);
            (function (rating) {
               $star.click(function() {
                     self.model.set({"Rating": rating});
                  })
            }) (i+1);
         }
         return $starField.find(".ui-icon-star");
      },
      newTagsEditField : function() {
         var self = this;
         var $tagField = this.newField("Tags", "ui-icon-tag");
         this.$tags = $("<div class='tag-list'></div>")
            .appendTo($tagField);
         $tagField.append("<br/>Type new tags, separated by commas<br/>");
         this.$newTags = $("<input type='text'></input>")
            .bind('keypress', function (evt) {
               if (evt.which == 13) {
                  evt.preventDefault();
                  self.parseTags()
               }
            })
            .textInput({size:40})
            .appendTo($tagField);
         return $tagField;
      },
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
      onChange : function() {
         this.dirty++;
         this.$error.hide();
         this.setModels();
         if (this.$error == undefined || this.$error.is(":hidden")) {
            this.$save.button({disabled : false, label: "Save"}); 
            this.saveTimeout = setTimeout(this.save, 5000);
         }
      },
      save : function() {
         if (this.dirty) {
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
      saveSuccess : function(model, response) {
         this.dirty--;
         if (this.$error) {
            this.$error.hide();
         }
         if (this.$save) {
            this.$save.button({disabled : true, label : "Saved"}); 
         }
      },
      del : function() {
         this.model.destroy();
         this.remove();
      },
      onHoverEnter : function(evt, viewCtor) {
         var target = evt.currentTarget;
         // check if this item has a model to give us data
         if (target && target.model) {
            // check if we're already preparing a hover view
            if (target.$hoverView)
               return false;
            target.$hoverView = $.make("div");
            var view = new viewCtor({ el : target.$hoverView,
                                     model: target.model,
                                     readOnly: true});
            view.render();
            var $target = $(target);
            var pos = $target.offset();
            pos.top = pos.top + $target.height() + 2;
            target.$hoverView
               .hoverView(pos)
               .hide()
               .appendTo(document.body);
            // delay showing for a second after hovering starts
            setTimeout(function() {
               var $hoverView = target.$hoverView;
               if ($hoverView && $hoverView.is(":hidden")) {
                  // after the timeout, show it, and add a delay so
                  //  it will not be hidden immediately after appearing
                  $hoverView.show('blind')
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
                  var added = this.model.tags.create({Word:nextTag},
                     {error:this.saveError });
               }
      },
      // render the tags from the tags collection in the $tags element
      renderTags : function () {
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
      },
      renderPairings: function () {
         var $pairings = this.$pairings;
         var pairings = this.model.pairings;
         var collection = window.Dishes;
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
         	   var $pairing = $("<li class='pairing dish'><span class='ui-icon ui-icon-dish inline'></span></li>")
            	   .appendTo($ul);
               $pairing[0].model = pairing.other;
         	   $("<a></a>")
            	   .appendTo($pairing)
            	   .text(pairing.other.get("Name"))
            	   .attr("href", "#viewDish/" + pairing.other.id);
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
      },
	   addPairing : function (desc, other) {
		   this.model.pairings.create({Other : other.id, Description : desc });
	   },
	   newPairing : function (evt, ui) { 
		   var other = ui.draggable[0].model;
		   var self = this;
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
      renderItemNameList : function (cssclass, viewLink, englishPlural) {
         this.el.children().remove();
         var self = this;
         var filtered;
         if (this.options.searchResults != undefined) {
            var results = this.options.searchResults;
            filtered = this.model.filter(function(item) {
                  return item.id in results;
               });
            filtered = _.sortBy(filtered, function(item) {
                  var key = $.zfill(9999 - results[item.id], 4);
                  return key + item.get("Name");
               });
         } else {
            filtered = this.model.toArray();
         }
            
         _.each(filtered, function(dish, idx) {
            var $li = $("<li><table class='li'><tr><td><span class='ui-icon inline ui-icon-"+cssclass+"'></span></td><td></td></tr></li>")
               .appendTo(self.el)
               .addClass(cssclass)
				   .draggable({revert:true,helper:'clone',appendTo:'body'});
            var $td = $li.find("td").eq(1);
            var name = dish.get("Name");
            $("<a></a>")
                  .appendTo($td)
                  .text(name)
                  .attr("href", "#" + viewLink + "/" + dish.id);
			   $li[0].model = dish;
         });
         if (filtered.length == 0) {
            var $li = $("<li>[No "+englishPlural+"]</li>")
               .appendTo(this.el)
         }
         return this;
      },
      drawChart : function ($dest, title, veggies, protein, carbs) {
         var data = new google.visualization.DataTable();
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
         chart.draw(data, {width: 100, height: 100, legend:'none',
            title : title, fontSize : 10, 
            colors : ["#459E00", "#B23500", "#770071"]});
      } 
   });
   window.DishListView = window.MealplannerView.extend({
      tagName : "ul",
      className : "dish-list",
      render : function() {
         this.renderItemNameList("dish", "viewDish", "dishes");
         return this;
      }
   })
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
         MealplannerView.prototype.initialize.call(this);
         _.bindAll(this, "edit");
         _.bindAll(this, "newPairing");
         this.model.tags.bind('all', this.render);
         this.model.ingredients.bind('all', this.render);
         this.model.pairings.bind('all', this.render);
         this.model.ingredients.fetchOnce();
         this.model.tags.fetchOnce();
         // alway fetch pairings -- we don't always see them get added
         this.model.pairings.fetch();
         this.createBasicView();
         this.$stars = this.newRatingField();
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

         this.$tags = $("<div class='tag-list'></div>")
            .appendTo(this.newField("Tags", "ui-icon-tag"));
         this.$mi = $("<table class='ingredients'><tr><th>Ingredient</th><th>Amount</th><th>Notes</th><th></th></tr></table>")
            .appendTo(this.$fields);
         var allIngredients = Ingredients.map(
               function(i) { return i.get("Name"); });
         var $lastRow = $("<tr></tr>")
            .appendTo(this.$mi);
         var $sugField = this.newField("Suggestions");

         this.$pairings = $("<div class='pairing-list'></div>")
            .appendTo($sugField);
			this.$pairingsDrop = $("<div class='dish-drop ui-widget-content'>Drag dishes here to add a suggestion.</div>")
				.appendTo($sugField)
				.droppable({
					accept: ".dish",
					hoverClass : "ui-state-highlight drop-accept",
					drop: this.newPairing
				});
         if (this.options.readOnly) {
            this.$pairingsDrop.hide();
         }
         this.$text = $("<div class='text'></div>")
            .appendTo(this.newField("Text")); 
      },
      render : function() {
         var self = this;
         this.$name.text(this.model.get("Name"));
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
         this.renderTags();
         var self = this;
         this.$mi.find("tr.ingredient").remove();
         this.model.ingredients.each(function(i) {
               var $tr = $("<tr class='ingredient'></tr>");
               $tr.attr("id", i.id);
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
               $tr[0].model = ingredient;
               $("<a></a>")
                     .appendTo($name)
                     .text(ingredient.get("Name"))
                     .attr("href", "#viewIngredient/" + ingredient.id);
               self.$mi.append($tr);
         });
         this.renderPairings();
         this.$text.html("");
         var lines = this.model.get("Text").split("\n");
         for (var l in lines) {
            var text = document.createTextNode(lines[l]);
            this.$text.append(text);
            this.$text.append("<br>");
         }
         return this;
      },
      del : function() {
         this.model.destroy();
         this.remove();
      },
      edit: function(ev) {
         this.trigger("editDish", this.model);
      },
   });
   window.DishEditView = window.MealplannerView.extend({
      tagName : "div",
      className : "dish-edit",
      icon : "ui-icon-dish",
      buttons : [
         {label:"Save", title: "Save this dish", click: "save" },
         {label:"Delete", title: "Delete this dish", click: "del" },
      ],
      initialize: function() {
         MealplannerView.prototype.initialize.call(this);
         _.bindAll(this, "newPairing");
         this.model.ingredients.bind('all', this.render);
         this.model.tags.bind('all', this.render);
         this.model.pairings.bind('all', this.render);
         this.model.ingredients.fetchOnce();
         this.model.tags.fetchOnce();
         // always fetch pairings, a given dish may not see one added
         this.model.pairings.fetch();
         this.ingredients = { gen : 0};
         this.createEditView();
         //  grey-out Save button when already saved (hasChanged == false)
         this.$save = this.$title.find("button[value='Save']")
               .button("option", "disabled", true);
         this.$stars = this.newRatingField();
         this.$source = $("<input type='text'></input>")
            .textInput({size:50})
            .appendTo(this.newField("Source"));
         this.$type = $("<input type='text'></input>")
            .appendTo(this.newField("Dish Type"))
            .textInput()
            .combo({source:["Entree", "Side", "Appetizer", "Dessert", "Drink"], minLength:0});
         var $ptField = this.newField("Prep Time")
         this.$prepTime = $("<input type='text'></input>")
            .textInput({size:4})
            .appendTo($ptField);
         $ptField.append(" minutes")
         var $ctField = this.newField("Cook Time");
         this.$cookTime = $("<input type='text'></input>")
            .textInput({size:4})
            .appendTo(this.el);
         $ctField.append(" minutes")
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
         
         this.newTagsEditField();
         this.$mi = $("<table class='ingredients'><tr><th>Ingredient</th><th>Amount</th><th>Notes</th><th></th></tr></table>")
            .appendTo(this.newField("Ingredients [Amount, extra instructions (chopped, peeled, etc.)]"));
         var allIngredients = Ingredients.map(
               function(i) { return i.get("Name"); });
         var $lastRow = $("<tr></tr>")
            .appendTo(this.$mi);
         this.$addIngredient = $("<input type='text'></input>")
            .appendTo($lastRow)
            .combo({source: allIngredients})
            .bind('keypress', function (evt) {
               if (evt.which == 13) {
                  evt.preventDefault();
                  self.addIngredient(false)
               }
            })

         var $sugField = this.newField("Suggestions");
         this.$pairings = $("<div class='pairing-list'></div>")
            .appendTo($sugField);
			this.$pairingsDrop = $("<div class='dish-drop ui-widget-content'>Drag dishes here to add a suggestion.</div>")
				.appendTo($sugField)
				.droppable({
					accept: ".dish",
					hoverClass : "ui-state-highlight drop-accept",
					drop: this.newPairing
				});
         this.$text = $("<textarea cols='50' rows='10'></textarea>")
            .appendTo(this.newField("Text"))
            .change(this.onChange);
            
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
         this.renderTags();
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
               ing.$del = $("<td><span class='remove ui-icon ui-icon-close'></span></td>")
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
         this.renderPairings();
         this.$text.val(this.model.get("Text"));
         return this;
      },
      focus : function() {
         this.$name.focus();
      },
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
      },
   })
   window.ServingView = Backbone.View.extend({
      initialize : function() {
         _.bindAll(this, "inc");
         _.bindAll(this, "sub");
         _.bindAll(this, "render");
         this.model.bind('all', this.render);
         this.$div = $.make("div", {class:"serving"})
            .appendTo(this.el);
         this.$span = $.make("div", {class:"serving-value"})
            .appendTo(this.$div);
         if (this.options.onChange) {
            var $plus = $("<span class='ui-icon ui-icon-plus inline'></span>")
               .appendTo(this.$div)
               .hide()
               .click(this.inc);
            var $minus = $("<span class='ui-icon ui-icon-minus inline'></span>")
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
         this.$span.html(this.htmlValue(this.val()));
      },
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
   window.IngredientListView = window.MealplannerView.extend({
      tagName : "ul",
      className : "ingredient-list",
      render : function() {
         this.renderItemNameList("ingredient", "viewIngredient", "ingredients");
         return this;
      },
   })
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
         MealplannerView.prototype.initialize.call(this);
         this.model.tags.bind('all', this.render);
         this.model.tags.fetchOnce();
         this.createEditView();
         //  grey-out Save button when already saved (hasChanged == false)
         this.$save = this.$title.find("button[value='Save']")
               .button("option", "disabled", true);

         this.$category = $("<input type='text'></input>")
            .textInput()
            .appendTo(this.newField("Category"))
            .combo({source:["Carbohydrate", "Protein", "Vegetable", "Fruit", "Sweet", "Spice", "Fat", "Herb"], minLength:0});
         this.$source= $("<input ></input>")
            .appendTo(this.newField("Source"))
            .combo({source:["Animal", "Vegan", "Vegetarian"], minLength:0});
         this.newTagsEditField();
      },
      render : function() {
         if (this.dirty) {
            this.$save.button({disabled : false, label: "Save"}); 
         }
         this.$name.val(this.model.get("Name"));
         this.$category.val(this.model.get("Category"));
         this.$source.val(this.model.get("Source"));
         this.renderTags();
         return this;
      },
      focus : function() {
         this.$name.focus();
      },
      setModels: function() {
         this.model.set({"Name": this.$name.val(),
            "Category": this.$category.val(),
            "Source": this.$source.val()
            });
         this.parseTags(true)
      },
   })
   window.IngredientView = window.MealplannerView.extend({
      tagName : "div",
      className : "ingredient-view",
      icon: "ui-icon-ingredient",
      buttons : [
         {label:"Edit", title: "Edit This Ingredient", click: "edit" },
         {label:"Delete", title: "Delete This Ingredient", click: "del" },
      ],
      initialize: function() {
         MealplannerView.prototype.initialize.call(this);
         var self = this;
         _.bindAll(this, "edit");
         _.bindAll(this, "dishesReceived");
         _.bindAll(this, "viewDish");
         this.model.tags.bind('all', this.render);
         this.model.tags.fetchOnce();
         this.createBasicView();
         this.$category = $("<span></span>")
            .appendTo(this.newField("Category"));
         this.$source = $("<span></span>")
            .appendTo(this.newField("Source"));
         this.$tags = $("<div class='tag-list'></div>")
            .appendTo(this.newField("Tags", "ui-icon-tag"));
         this.$dishes = $("<div class='dishes'>Loading...</div>")
            .appendTo(this.newField("Dishes with this ingredient"));
         jQuery.getJSON(this.model.url() + "/in/", this.dishesReceived);
      },
      render : function() {
         this.$name.text(this.model.get("Name"));
         this.$category.text(this.model.get("Category"));
         this.$source.text(this.model.get("Source"));
         this.renderTags();
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
   window.MenuBarView = window.MealplannerView.extend({
      tagName : "div",
      className : "menubar",
      events : {
         "autocompletechange input" : "changeMenu",
         "autocompleteselect input" : "changeMenu"
      },
      initialize: function() {
         MealplannerView.prototype.initialize.call(this);

         this.el.append("<div class='name'><span class='ui-icon ui-icon-menu inline large'></span>Menus</div>");
         this.$menus = $("<input class='menu-combo' type='text' value='<New Menu>' size='15'></input>")
               .appendTo(this.el)
               .combo({source:[]});
      },
      render : function() {
         var menus = this.model.map(function(item) { return item.get("Name"); });
         this.$menus.autocomplete("option", "source", menus);
         this.changeMenu();
         return this;
      },
      changeMenu : function(e, ui) {
         var self = this;
         var menuName = this.$menus.val();
         if (ui && ui.item) {
            menuName = ui.item.value;
         }
         this.model.each(function(model) {
            if (model.get("Name") == menuName) {
               if (self.menuView) {
                  self.menuView.remove();
               }
               self.menuView = new MenuView({model: model});
               self.el.append(self.menuView.render().el);
            }
         });
      },
      setContext : function(model) {
         if (this.menuView) {
            this.menuView.setContext(model);
         }
      }
   })
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
         MealplannerView.prototype.initialize.call(this);
         _.bindAll(this, "clearMenu");
         _.bindAll(this, "cloneMenu");
         _.bindAll(this, "addCurDish");
         _.bindAll(this, "newDish");
         Dishes.bind('all', this.render);

         this.createBasicView();
         // we don't show the name in this view, it's shown by parent
         this.$name.remove();
         this.$add = this.$buttons.find("button[value='Add']");
         this.$save = this.$buttons.find("button[value='Save']");
         // add rounding to clear, button set doesn't know only one
         //  of delete and clear are visible at a time
         this.$clear= this.$buttons.find("button[value='Clear']")
            .addClass("ui-corner-right");
      
         this.$delete = this.$buttons.find("button[value='Delete']");
         this.$dishes = $("<ul class='dish-list'></ul>")
            .appendTo(this.newField("Dishes"));
         var $p = $("<p></p>")
            .appendTo(this.$fields);
            
         $("<a class='field-head'>Ingredients, etc. »</a>")
            .attr("href", "#viewMenu/" + this.model.id)
            .appendTo($p);
         $(this.el)
				.droppable({
					accept: ".dish",
					hoverClass : "ui-state-highlight drop-accept",
					drop: this.newDish
				});
         var $charts = $("<div class='menu-chart'></div>")
            .appendTo(this.newField("Nutritional Balance"));
         this.$menuChart = $("<span>")
            .appendTo($charts);
         this.$targetChart = $("<span>")
            .appendTo($charts);
         $charts.append("<div class='legend'><span class='sample' style='background:#459E00;'></span> Fruits &amp; Veggetables<br><span class='sample' style='background:#B23500'></span> Protein<br><span class='sample' style='background:#770071'></span> Carbohydrates</div>");
      },
      render : function() {
         var self = this;
         var name = this.model.get("Name");
         if (this.model == Menus.getDraftMenu()) {
            this.$delete.hide();
         } else {
            this.$clear.hide();
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
         var veggies = 0;
         var protein = 0;
         var carbs = 0;
         _.each(dishes, function(dish) {
            var $li = $("<li class='dish'><span class='ui-icon inline ui-icon-dish'></span></li>")
               .appendTo(self.$dishes)
               .draggable({revert:true,helper:'clone',appendTo:'body'});
            var name = dish.get("Name");
            $("<a></a>")
                  .appendTo($li)
                  .text(name)
                  .attr("href", "#viewDish/" + dish.id);
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
            veggies += dish.get("ServingsVeggies");  
            protein += dish.get("ServingsProtein");  
            carbs += dish.get("ServingsCarb");  
         });
         if (dishes.length == 0) {
            self.$dishes.append("<li class='dish'>Drag dishes here to add them to the menu, or click the 'Add' button above.</li>");
         }
         if (this.curDish()) {
            if (this.model.hasDish(this.curDish())) {
               this.$add.button("option", "disabled", true);
            } else {
               this.$add.button("option", "disabled", false);
            }
         } else {
            this.$add.button("option", "disabled", false);
         }
         // delay chart drawing, because it fails if the
         //  element isn't rooted in the document yet
         setTimeout( function() {
            self.drawChart(self.$menuChart, "This Menu", veggies, protein, carbs);
            self.drawChart(self.$targetChart, "Target", 2, 1, 1);
            }, 10);
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
                     // empty the draft menu
                     self.model.save({Dishes: [] });
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
      },
      newDish : function(evt, ui) {
		   var other = ui.draggable[0].model;
         if (other && !this.model.hasDish(other)) {
            var dishes = this.model.get("Dishes");
            dishes.push(other.id);
            this.model.save({Dishes:dishes});
            this.render();
         }
      },
      curDish : function() {
         if (App.curContext) {
            if (App.curContext.defaults == Dish.prototype.defaults)
               return App.curContext;
         }
         return null;
      },
      addCurDish : function() {
		   var other = this.curDish();
         if (other && !this.model.hasDish(other)) {
            var dishes = this.model.get("Dishes");
            dishes.push(other.id);
            this.model.save({Dishes:dishes});
         }
         this.render();
      },
      setContext : function(model) {
         var showAdd = true;
         if (model.defaults == Dish.prototype.defaults) {
            if (this.model.hasDish(model)) {
               showAdd= false;
            }
         } else {
            showAdd = false;
         }
         this.$add.button("option", "disabled", !showAdd);
      }
   })
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
         MealplannerView.prototype.initialize.call(this);
         _.bindAll(this, "clearMenu");
         _.bindAll(this, "cloneMenu");
         _.bindAll(this, "newDish");
         this.createBasicView();
         this.$save = this.$buttons.find("button[value='Save']");
         // add rounding to clear, button set doesn't know only one
         //  of delete and clear are visible at a time
         this.$clear= this.$buttons.find("button[value='Clear']")
            .addClass("ui-corner-right");
      
         this.$delete = this.$buttons.find("button[value='Delete']");

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
         $charts.append("<div class='legend'><span class='sample' style='background:#459E00;'></span> Fruits &amp; Veggetables<br><span class='sample' style='background:#B23500'></span> Protein<br><span class='sample' style='background:#770071'></span> Carbohydrates</div>");
         this.el.droppable({
					accept: ".dish",
					hoverClass : "ui-state-highlight drop-accept",
					drop: this.newDish
				});
      },
      render : function() {
         var self = this;
         var name = this.model.get("Name");
         this.$name.text(name);
         if (this.model == Menus.getDraftMenu()) {
            this.$delete.hide();
         } else {
            this.$clear.hide();
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
         var veggies = 0;
         var protein = 0;
         var carbs = 0;
         var allIngredients = {};
         _.each(dishes, function(dish) {
            dish.ingredients.fetchOnce({success: self.render});
            dish.ingredients.each(function(ingredient) {
               var model = Ingredients.get(ingredient.get("Ingredient"));
               if (model) {
                  if (model.id in allIngredients) {
                     allIngredients[model.id].dishes.push(dish.get("Name")); 
                  } else {
                     allIngredients[model.id] = {ingredient : model, dishes : [dish.get("Name")]};
                  }
               }
            });
            var $li = $("<li class='dish'><span class='ui-icon inline ui-icon-dish'></span></li>")
               .appendTo(self.$dishes)
               .draggable({revert:true,helper:'clone',appendTo:'body'});
			   $li[0].model= dish;
            var name = dish.get("Name");
            $("<a></a>")
                  .appendTo($li)
                  .text(name)
                  .attr("href", "#viewDish/" + dish.id);
            $li.append( " " + dish.get("PrepTimeMinutes") + " + " + dish.get("CookTimeMinutes") + " = " + (parseInt(dish.get("PrepTimeMinutes")) + parseInt(dish.get("CookTimeMinutes"))) + " minutes");
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
            veggies += dish.get("ServingsVeggies");  
            protein += dish.get("ServingsProtein");  
            carbs += dish.get("ServingsCarb");  
         });

         this.$ingredients.children().remove();
         var ingredients = _.sortBy(allIngredients, function(ing) {
               return ing.ingredient.get("Name");
            });
         _.each(ingredients, function(ing) {
            var ingredient = ing.ingredient;
            var $li = $("<li class='ingredient'><span class='ui-icon inline ui-icon-ingredient'></span></li>")
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
                  $li.append(" (");
                  }
                  $li.append(dishName);
               });
               $li.append(")");
         });
         
         // delay chart drawing, because it fails if the
         //  element isn't rooted in the document yet
         setTimeout( function() {
            self.drawChart(self.$menuChart, "This Menu", veggies, protein, carbs);
            self.drawChart(self.$targetChart, "Target", 2, 1, 1);
            }, 10);
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
                     // empty the draft menu
                     self.model.save({Dishes: [] });
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
      },
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
   window.User = MealplannerModel.extend({
      
   });

   window.UserList = MealplannerCollection.extend({
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
               .autoHide({handle:this.el})
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

   window.Search = MealplannerModel.extend({
      
   });
   window.SearchView = window.MealplannerView.extend({
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
         _.bindAll(this, "onMenuFetched");
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
         this.el.find(".add-ingredient")
                  .button()
                  .click(this.newIngredient)
                  .parent()
                     .buttonset();
         
         $("#br-controls")
            .autoHide({handle:$("#backup-restore")});
			$("#restore-file")
            .change(this.restore);
         $("#side-tabs").tabs({
         });
         this.fetched = 0;
         this.show(new LoadingView());
         Menus.fetch({success:this.onMenuFetched, error:this.onFetched});
         Users.fetch({success:this.onFetched, error:this.onFetched});
         Dishes.fetch({success:this.onFetched, error:this.onFetched});
         Ingredients.fetch({success:this.onFetched, error:this.onFetched});
         jQuery.getJSON("/tags", this.renderTags);
      },
      onMenuFetched : function() {
         this.menuBarView = new MenuBarView({model: Menus});
         $("#menubar").append(this.menuBarView.render().el);
         this.onFetched();
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
               .attr("href", "#search/" + tags[tag] + "//");
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
         if (view.model) {
            this.curContext = view.model;
			   document.title = view.model.get("Name");
         }
         if (this.menuBarView) {
            this.menuBarView.setContext(view.model);
         }
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
         var nd = Dishes.create({}, { success : function( model) {
            this.editDish(model)
         }.bind(this)});
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
         Ingredients.create({}, {success:
            function(model) {
               this.editIngredient(model)
         }.bind(this)});
      },
      viewIngredient : function(ingredient) {
         var viewIngredient = new IngredientView({model : ingredient})
         viewIngredient.bind("edit", this.editIngredient);
         this.show(viewIngredient);
         window.Workspace.navigate("viewIngredient/" + ingredient.id);
      },
      viewMenu : function(model) {
         var viewMenu = new MenuDetailView({model : model})
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

