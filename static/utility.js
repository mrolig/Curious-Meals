// Copyright (c) 2011 Michael Rolig
// Distributed under the MIT License see file LICENSE
//  or license section in index.html
//
// jQuery add-on functions
(function($) {
   // make the element hide when the specified container element is hovered
   // options {
   //   handle : jQuery object -- when hovering over handle, this element is shown
   // }
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
   // make the element appear only when the handele is clicked
   // options : {
   //   handle : jQuery object - element that when clicked, show the menu
   // }
   $.fn.mpmenu = function(options) {
      if (options.handle) {
			var $icon = $("<span class='ui-icon inline ui-icon-triangle-1-e'></span>");
			options.handle.prepend($icon);
         // start hidden, attach to body to avoid a clipping parent
         this.hide()
				.appendTo(document.body)
				.addClass("menu")
				.addClass("ui-corner-bottom");
         // unhide when the handle hovers
         options.handle.click(function() {
				if (this.is(":hidden")) {
					var pos = options.handle.offset();
					this.css("top", pos.top + options.handle.height());
					this.css("left", pos.left);
					$icon.addClass("ui-icon-triangle-1-s");
					$icon.removeClass("ui-icon-triangle-1-e");
            	this.show('blind');
				} else {
					$icon.addClass("ui-icon-triangle-1-e");
					$icon.removeClass("ui-icon-triangle-1-s");
            	this.hide('blind');
				}
         }.bind(this));
      }
      return this;
   }
   // hoverView - position the element to hover based on positioning given
   //  
   // options : {
   //   left : position to be considered for left edge
   //   right: position to be considered for right edge
   //   top : position for top of element
   $.fn.hoverView = function(options) {
      this.addClass('hover-view');
      this.addClass('ui-widget-content');
      if ("left" in options && "right" in options) {
         if (options.left < 200) {
            this.css("left", options.left);
         } else {
            this.css("right", options.right);
         }
      } else if ("left" in options) {
         this.css("left", options.left);
      } else if ("right" in options) {
         this.css("right", options.right);
      }
      if ("top" in options) {
         this.css("top", options.top);
      }
      return this; 
   }
   // make a new element with tag, attributes and content and append it 
   // to the current element
   $.fn.appendNew = function(tag, attributes, content) {
      var $new = $.make(tag, attributes, content);
      this.append($new);
      return this;
   }
   // make and return a new element with tag, attributes and content specified
   //  make (tag, [attributes], [content])
   //  tag is element tag, e.g. 'div'
   //  attributes is a dictionary of {"name", "value"} for the DOM element to receive
   //  set with jQuery.attr
   //  content is the inner HTML to be assigned to the new element
   // returns jQuery object
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
      // need to delay because browser doesn't
      // seem to like selecting immediately
      this.focus(function() {
         setTimeout(function() {
            if (self.is(":focus")) self.select()
         }, 10);
      });
      this.attr("size", options.size);
      return this;
   }
   // creates a combo box using autocomplete and adding a drop-down button
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
   // zero fills the string, adding leading zeros to make the length total at least count
   $.zfill = function (str, count) {
      var zeros = count - str.toString().length;
      if (zeros <= 0) return str;
      var ret = Array(zeros+1).join("0") + str;
      return ret;
   }
   // create a span with proper ui-icon classes to show an icon
   // returns jQuery object
   $.makeIcon = function(iconClass, large) {
      var $icon = $.make("span")
         .addClass("ui-icon")
         .addClass("inline")
         .addClass(iconClass);
      if (large) {
         $icon.addClass("large")
      }
      return $icon;
   }
   $.makeRemoveIcon = function() {
      return $("<span class='remove ui-icon ui-icon-close'></span>");
   }
 
})(jQuery);

