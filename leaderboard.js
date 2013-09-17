// Set up a collection to contain note information. On the server,
// it is backed by a MongoDB collection named "notes".

Notes = new Meteor.Collection("notes");

var noParentsQuery = {$or:[{parent:{$exists:0}},{parent:{$in:[null,0]}}]};

Validation = {
  clear: function () { 
    return Session.set("error", undefined); 
  },
  set_error: function (message) {
    return Session.set("error", message);
  },
  valid_name: function (name) {
    this.clear();
    if (name.length == 0) {
      this.set_error("Name can't be blank");
      return false;
    }
    return true;
  },
  note_exists: function(name) {
    return Notes.findOne({name: name});
  }
};

Meteor.methods({
  note_delete:function(id,parent){
      var children = Notes.update({parent:id},{$set:{parent:parent}},{multi:true});
      Notes.remove(id);
  }
, note_close:function(id){
    var node = Notes.findOne(id);
    if(node){
      var state = (node.closed == 'closed') ? 'open' : 'closed';
      Notes.update({_id:id},{$set:{closed:state}});
    }
  }
, note_delete_tree:function(id,parent){
      var children = Notes.remove({parent:id});
      Notes.remove(id);
  }
, note_add:function(name,parent_id){
    var HighestScoreObject = Meteor.call('note_nextHighestScoreObject',parent_id);
    var score = HighestScoreObject ? HighestScoreObject.score + 1 : 0;
    if(name){
      var obj = {name: name, score: score, parent:parent_id || 0,closed:'open'};
      Notes.insert(obj); 
    }
  }
, note_nextHighestScoreObject: function(parent){
    var query = parent? {parent:parent} : noParentsQuery;
    return Notes.find(query,{sort: {score: -1}}).fetch()[0];
  }
, note_inc:function(id){
    var obj = Notes.findOne(id);
    var score = obj.score-1;
    if(score<0){score=0;}
    var prev = Notes.findOne({score:score});
    if(prev){
      if(prev._id==obj._id){return;}
      Notes.update(prev._id, {$set: {score: obj.score}});
    }
    Notes.update(obj._id,{$set:{score:score}});
  }
, note_dec:function(id){
    var obj = Notes.findOne(id);
    var score = obj.score+1;
    var highestScore = Meteor.call('note_nextHighestScoreObject');
    if(highestScore && score > highestScore.score){score = highestScore.score;}
    var prev = Notes.findOne({score:score});
    if(prev){
      if(prev._id==obj._id){return;}
      if(prev.score>score){score = prev.score;}
      Notes.update(prev._id, {$set: {score: obj.score}});
    }
    Notes.update(obj._id,{$set:{score:score}});
  }
})

function note_add(){
  var id = Session.get("selected_note") || 0
  var elementId = 'new_note_name'+(id? '_'+id:'');
  var textbox = document.getElementById("new_note_name");
  var new_note_name = textbox.value.trim();//.replace(/\n|\r/g,'<br>');
  if (Validation.valid_name(new_note_name)) {
    Meteor.call('note_add',new_note_name,id)
  }
  textbox.select();
}

if (Meteor.isClient) {

  var Router = new (Backbone.Router.extend({
    routes: {
      ":id": "main"
    },
    main: function (id) {
      var oldId = Session.get("root");
      if (oldId !== id) {
        Session.set("root", id);
      }
    },
    set: function (id) {
      //this.navigate(id, true);
    }
  }));

  Backbone.history.start({pushState: true});

  $(function(){
    console.log('this works?');
  })

  Template.note_tree.notes = function () {
    var parentId = Session.get("root");
    if(!parentId){
      var notes = Notes.find(noParentsQuery, {sort: {score: 1, name: 1}});
      return notes;
    }
    return false;
  };

  Template.note_tree.root = function(){
    var parentId = Session.get("root");
    if(parentId){
      var root = Notes.findOne(parentId);
      return root;
    }
    return false;
  }

  Template.note_tree.selected_name = function () {
    var note = Notes.findOne(Session.get("selected_note"));
    return note && note.name;
  };

  Template.note.selected = function () {
    return Session.equals("selected_note", this._id) ? "selected" : '';
  };

  Template.note.hasChildren = function (){
    var obj = Notes.findOne({parent:this._id});
    return obj ? 'hasChildren' : 'noChildren';
  };

  Template.note.preserve(['.note']);

  Template.note.children = function (){
    return Notes.find({parent:this._id},{sort: {score: 1, name: 1}})
  };

  Template.note_tree.error = function () {
    return Session.get("error");
  };

  Template.note.events({
    'click a.action-delete': function(evt){
      var parent = this.parent || null;
      Meteor.call("note_delete",this._id,parent);
      return false;
    },
    'click .handle':function(evt){
      Meteor.call("note_close",this._id);
      return false;
    },
    'click input.add': function(){
      note_add(0);
    },
    'click': function(e){
      var current_note = Session.get("selected_note");
      var id = (current_note == this._id) ? 0 : this._id;
      Session.set("selected_note", id);
      Router.set(this._id);
      e.stopImmediatePropagation();
    }
  });

  Template.new_note.events = {
    'click a.action-add': function () {
      note_add();
    }
    , 'keyup':function(e){
        if(e.keyCode==13){
          if(e.shiftKey){
            return;
          }
          if(e.ctrlKey){
            return;
          }
          note_add();
          return false;
        }
      }
    ,'click a.action-move-up': function(e){
        e.preventDefault();
        var note = Session.get("selected_note");
        if(!note){return false;}
        Meteor.call("note_inc",note);
    }
    ,'click a.action-move-down': function(e){
        e.preventDefault();
        var note = Session.get("selected_note");
        if(!note){return false;}
        Meteor.call("note_dec",note);
    }
  };

  Template.note_tree.events = {
    'click #note_tree':function(){
      //put an element to click in order to deselect all
      Session.set("selected_note",0)
    }
  ,    'click input.inc': function(){
        Notes.update(Session.get("selected_note"), {$inc: {score: 5}});
      }
  }

}


// On server startup, create some notes if the database is empty.
if (Meteor.isServer){
  Meteor.startup(function () {
    if (Notes.find().count() === 0) {
      var names = ["Ada Lovelace",
                   "Grace Hopper",
                   "Marie Curie",
                   "Carl Friedrich Gauss",
                   "Nikola Tesla",
                   "Claude Shannon"];
      for (var i = 0; i < names.length; i++)
        Notes.insert({name: names[i], score: i,parent:0,closed:'open'});
    }
  });
}