/**

    The MIT License

    Copyright (c) 2011 Arunoda Susiripala

    Permission is hereby granted, free of charge, to any person obtaining a copy
    of this software and associated documentation files (the "Software"), to deal
    in the Software without restriction, including without limitation the rights
    to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
    copies of the Software, and to permit persons to whom the Software is
    furnished to do so, subject to the following conditions:

    The above copyright notice and this permission notice shall be included in
    all copies or substantial portions of the Software.

    THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
    IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
    FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
    AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
    LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
    OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
    THE SOFTWARE.

 */
 
 
/*

    This is a modified version of Node Simple XMPP (https://github.com/simple-xmpp/node-simple-xmpp)
    The changes are too small to create a fork, and the use case is too specific. They also deviate
    from the original purpose of the module, so not point in publishing.
    
    Changes:
     * Changed "send" method to allow more flexibility.
     * Removed a few other methods that I don't need.
 
 */


var xmpp = require('node-xmpp');
var EventEmitter = require('events').EventEmitter;
var util = require('util');
var qbox = require('qbox');
var colors = require('colors');
var config = require('./config');

var STATUS = {
    AWAY: "away",
    DND: "dnd",
    XA: "xa",
    ONLINE: "online",
    OFFLINE: "offline"
};

var NS_CHATSTATES = "http://jabber.org/protocol/chatstates";

var listener_defaults = {
    online: function() {
        console.log("Connected.");
    },
    chat: function(from, message) {
        console.log(from.yellow + ": " + message.blue);
    },
    stanza: function(stanza) {
        console.log(stanza.root().toString().green);
    },
    error: function(error) {
        console.log((error).red);
    }
};

module.exports = function(user) {
    this.client = new SimpleXMPP();
    
    if(typeof user.on !== "object")
    user.on = {};
    
    if(user.defaults !== false) {
        for(var listener in listener_defaults) {
            this.client.on(listener, (typeof user.on[listener] === "function" ? user.on[listener] : listener_defaults[listener]));
        }
    } else {
        for(var listener in user.on) {
            this.client.on(listener, user.on[listener]);
        }
    }
    
    this.client.on('error', function(error) {
        console.log("ERROR!".red);
        console.log(error);
    });
    
    this.client.connect(user.credentials);
    return this.client;
};

function SimpleXMPP() {

    //setting status here
    this.STATUS = STATUS;
    var self = this;
    this.Element = xmpp.Element;
    var config;
    var conn;
    var probeBuddies = {};
    var joinedRooms = {};
    var capabilities = {};
    var capBuddies = {};
    var iqCallbacks = {};
    var $ = qbox.create();

    var events = new EventEmitter();
    this.on = function() {
        events.on.apply(events, Array.prototype.slice.call(arguments));
    };
    this.removeListener = function() {
        events.removeListener.apply(events, Array.prototype.slice.call(arguments));
    };

    this.events = events;
    this.conn = conn;
        
    this.send = function(params) {
                
        $.ready(function() {
        
            var stanza = new xmpp.Element('message', {
                xmlns: 'jabber:client', 
                id: ~(new Date().getTime()/443), 
                to: params.to, 
                type: (params.group ? 'groupchat' : 'chat')
            });
            
                stanza.c('body', { xmlns : 'jabber:client' }).t(params.message);
            
            var extraParams = stanza.c('extraParams', {xmlns : 'jabber:client'});
                extraParams.c("date_sent").t(~~(Date.now()/1000));
            
            if(params.history) {
                extraParams.c("save_to_history").t("1");
            }            
            
            if(params.extra) {
                Object.keys(params.extra).forEach( function(field) {
                    extraParams.c(field).t(params.extra[field]);
                });
            }
            
            conn.send(stanza);
            
            if(params.debug) {
                console.log(stanza.root().toString().red)
            }
        });
    };

    this.join = function(to) {
        var room = to.split('/')[0];
        
        $.ready(function() {
            if(!joinedRooms[room]){
                joinedRooms[room] = true;
            }
            var stanza =  new xmpp.Element('presence', { to: to }).
            c('x', { xmlns: 'http://jabber.org/protocol/muc' });
            conn.send(stanza);
        });
        
        return room;
    };

    this.subscribe = function(to) {

        $.ready(function() {
            var stanza = new xmpp.Element('presence', { to: to, type: 'subscribe' });
            conn.send(stanza);
        });
    };

    this.unsubscribe = function(to) {

        $.ready(function() {
            var stanza = new xmpp.Element('presence', { to: to, type: 'unsubscribe' });
            conn.send(stanza);
        });
    };

    this.acceptSubscription = function(to) {

        // Send a 'subscribed' notification back to accept the incoming
        // subscription request
        $.ready(function() {
            var stanza = new xmpp.Element('presence', { to: to, type: 'subscribed' });
            conn.send(stanza);
        });
    };

    this.acceptUnsubscription = function(to) {

        $.ready(function() {
            var stanza = new xmpp.Element('presence', { to: to, type: 'unsubscribed' });
            conn.send(stanza);
        });
    };

    this.getRoster = function() {

        $.ready(function() {
            var roster = new xmpp.Element('iq', { id: 'roster_0', type: 'get' });
            roster.c('query', { xmlns: 'jabber:iq:roster' });
            conn.send(roster);
        });
    };

    this.probe = function(buddy, callback) {

        probeBuddies[buddy] = true;
        $.ready(function() {
            var stanza = new xmpp.Element('presence', {type: 'probe', to: buddy});
            events.once('probe_' + buddy, callback);
            conn.send(stanza);
        });
    };


    // Method: setPresence
    //
    // Change presence appearance and set status message.
    //
    // Parameters:
    //   show   - <show/> value to send. Valid values are: ['away', 'chat', 'dnd', 'xa'].
    //            See http://xmpp.org/rfcs/rfc3921.html#rfc.section.2.2.2.1 for details.
    //            Pass anything that evaluates to 'false' to skip sending the <show/> element.
    //   status - (optional) status string. This is free text.
    //
    // TODO:
    // * add caps support
    this.setPresence = function(show, status) {
        $.ready(function() {
            var stanza = new xmpp.Element('presence');
            if(show && show !== STATUS.ONLINE) {
                stanza.c('show').t(show);
            }
            if(typeof(status) !== 'undefined') {
                stanza.c('status').t(status);
            }
            conn.send(stanza);
        });
    };

    // Method: setChatstate
    //
    // Send current chatstate to the given recipient. Chatstates are defined in
    // <XEP-0085 at http://xmpp.org/extensions/xep-0085.html>.
    //
    // Parameters:
    //   to    - JID to send the chatstate to
    //   state - State to publish. One of: active, composing, paused, inactive, gone
    //
    // See XEP-0085 for details on the meaning of those states.
    this.setChatstate = function(to, state) {
        $.ready(function() {
            var stanza = new xmpp.Element('message', { to: to }).
                c(state, { xmlns: NS_CHATSTATES }).
                up();
            conn.send(stanza);
        });
    };

    // TODO: document!
    //
    // Options:
    //   * skipPresence - don't send initial empty <presence/> when connecting
    //
    
    
    this.disconnect = function() {
        $.ready(function() {
            var stanza = new xmpp.Element('presence', { type: 'unavailable' });
            stanza.c('status').t('Logged out');
            conn.send(stanza);
        });
            
        var ref = this.conn.connection;
        if (ref.socket.writable) {
            if (ref.streamOpened) {
                ref.socket.write('</stream:stream>');
                delete ref.streamOpened;
            } else {
                ref.socket.end();
            }
            ref.socket.destroy();
        }
    };
    
    
    this.connect = function(params) {

        config = params;
        conn = new xmpp.Client(params);
        self.conn = conn;

        conn.on('close', function() {
            $.stop();
            events.emit('close');
        });
        
        self.conn.connection.socket.on('error', function() {
            console.error.bind(console, 'SocketError:');
        });
        
        conn.on('online', function(){
            if(! config.skipPresence) {
                conn.send(new xmpp.Element('presence'));
            }
            events.emit('online');
            $.start();

            // keepalive
            self.conn.connection.socket.setTimeout(0);
            self.conn.connection.socket.setKeepAlive(true, 10000);
        });

        conn.on('stanza', function(stanza) {
            events.emit('stanza', stanza);
            //console.log(stanza);
            //looking for message stanza
            if (stanza.is('message')) {

                //getting the chat message
                if(stanza.attrs.type == 'chat') {

                    var body = stanza.getChild('body');
                    if(body) {
                        var message = body.getText();
                        var from = stanza.attrs.from;
                        var id = from.split('/')[0];
                        events.emit('chat', id, message);
                    }

                    var chatstate = stanza.getChildByAttr('xmlns', NS_CHATSTATES);
                    if(chatstate) {
                        // Event: chatstate
                        //
                        // Emitted when an incoming <message/> with a chatstate notification
                        // is received.
                        //
                        // Event handler parameters:
                        //   jid   - the JID this chatstate noticiation originates from
                        //   state - new chatstate we're being notified about.
                        //
                        // See <SimpleXMPP#setChatstate> for details on chatstates.
                        //
                        events.emit('chatstate', stanza.attrs.from, chatstate.name);
                    }

                } else if(stanza.attrs.type == 'groupchat') {

                    var body = stanza.getChild('body');
                    if(body) {
                        var message = body.getText();
                        var from = stanza.attrs.from;
                        var conference = from.split('/')[0];
                        var id = from.split('/')[1];
                        var stamp = null;
                        if(stanza.getChild('x') && stanza.getChild('x').attrs.stamp)
                            stamp = stanza.getChild('x').attrs.stamp;
                        events.emit('groupchat', conference, id, message, stamp);
                    }
                }
            } else if(stanza.is('presence')) {

                var from = stanza.attrs.from;
                if(from) {
                  if(stanza.attrs.type == 'subscribe') {
                      //handling incoming subscription requests
                      events.emit('subscribe', from);
                  } else if(stanza.attrs.type == 'unsubscribe') {
                      //handling incoming unsubscription requests
                      events.emit('unsubscribe', from);
                  } else {
                      //looking for presence stenza for availability changes
                      var id = from.split('/')[0];
                      var statusText = stanza.getChildText('status');
                      var state = (stanza.getChild('show'))? stanza.getChild('show').getText(): STATUS.ONLINE;
                      state = (state == 'chat')? STATUS.ONLINE : state;
                      state = (stanza.attrs.type == 'unavailable')? STATUS.OFFLINE : state;
                      //checking if this is based on probe
                      if(probeBuddies[id]) {
                          events.emit('probe_' + id, state, statusText);
                          delete probeBuddies[id];
                      } else {
                          //specifying roster changes
                          if(joinedRooms[id]){
                            var groupBuddy = from.split('/')[1];
                            events.emit('groupbuddy', id, groupBuddy, state, statusText);
                          } else {
                            events.emit('buddy', id, state, statusText);
                          }
                      }

                      // Check if capabilities are provided
                      var caps = stanza.getChild('c', 'http://jabber.org/protocol/caps');
                      if (caps) {
                          var node = caps.attrs.node,
                              ver = caps.attrs.ver;

                          if (ver) {
                              var fullNode = node + '#' + ver;
                              // Check if it's already been cached
                              if (capabilities[fullNode]) {
                                  events.emit('buddyCapabilities', id, capabilities[fullNode]);
                              } else {
                                  // Save this buddy so we can send the capability data when it arrives
                                  if (!capBuddies[fullNode]) {
                                      capBuddies[fullNode] = [];
                                  }
                                  capBuddies[fullNode].push(id);

                                  var getCaps = new xmpp.Element('iq', { id: 'disco1', to: from, type: 'get' });
                                  getCaps.c('query', { xmlns: 'http://jabber.org/protocol/disco#info', node: fullNode });
                                  conn.send(getCaps);
                              }
                          }
                      }

                  }
                }
            } else if (stanza.is('iq')) {

                // Response to capabilities request?
                if (stanza.attrs.id === 'disco1') {
                    var query = stanza.getChild('query', 'http://jabber.org/protocol/disco#info');

                    // Ignore it if there's no <query> element - Not much we can do in this case!
                    if (!query) {
                        return;
                    }

                    var node = query.attrs.node,
                        identity = query.getChild('identity'),
                        features = query.getChildren('feature');

                    var result = {
                        clientName: identity && identity.attrs.name,
                        features: features.map(function (feature) { return feature.attrs['var']; })
                    };

                    capabilities[node] = result;

                    // Send it to all buddies that were waiting
                    if (capBuddies[node]) {
                        capBuddies[node].forEach(function (id) {
                            events.emit('buddyCapabilities', id, result);
                        });
                        delete capBuddies[node];
                    }
                }

                var cb = iqCallbacks[stanza.attrs.id];
                if(cb) {
                    cb(stanza);
                    delete iqCallbacks[stanza.attrs.id];
                }
            }
        });

        conn.on('error', function(err) {
            events.emit('error', err);
        });

    };

}