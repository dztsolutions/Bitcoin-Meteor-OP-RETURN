UsersBitcoin = new Mongo.Collection("usersBitcoin");
SpentTx = new Mongo.Collection("spentTx");
createdRecords = new Mongo.Collection("createdRecords");

// Todo
// after tx is broadcasted, enter the tx that was spent into SpentTx db
// after tx is broadcasted, enter the tx that was created into createdRecords

if (Meteor.isClient) {

    var getBitcoinStatus = function () {
        Meteor.call("checkAddressBalance", function (error, results) {
            if (results.data.length > 0) {
                Session.set("hasInputs", results.data);
                Session.set("depositBitcoin", false);

            } else {
                Meteor.call("getBitcoinAddress", function (error, result) {
                    console.log(result);
                    Session.set("depositBitcoin", result);
                });

            }
        });
    };

    if (Meteor.userId()) {
        Session.set("hasInputs", false);
        Session.set("depositBitcoin", false);


        getBitcoinStatus()

        Tracker.autorun(function () {
            if (Meteor.userId()) {
                getBitcoinStatus()
            }
        });
    }

    Accounts.ui.config({
        passwordSignupFields: "USERNAME_ONLY"
    });

    Template.body.helpers({
        hasInputs: function () {
            console.log(Session.get("hasInputs"));
            return Session.get("hasInputs");
        },
        depositBitcoin: function () {
            return Session.get("depositBitcoin");
        }


    });

    Template.body.events({
        "click .refresh": function () {
            getBitcoinStatus()
        },
        "change [id=tx]": function (evt) {
            var selectedTx = Session.get("hasInputs")[$(evt.target).val()];
            Session.set("selectedTx", selectedTx);
        },
        "change [id=op_return]": function (evt) {
            var message = $(evt.target).val();
            Session.set("opReturnMessage", message);
        },
        "click [id=submitOpReturn]": function (evt) {
            evt.preventDefault();
            var submission = {
                "message": Session.get("opReturnMessage"),
                "tx": Session.get("selectedTx")
            };

            if (!submission.tx) {
                return alert("please select a tx")
            }

            if (!submission.message || submission.message === "") {
                return alert("please enter a message")
            }

            console.log(submission);
        }
    });


    //Template.hello.helpers({
    //    counter: function () {
    //        return Session.get('counter');
    //    },
    //    input: function () {
    //        return "test"
    //    }
    //
    //
    //});
    //
    //Template.hello.events({
    //    'click button': function () {
    //        // increment the counter when button is clicked
    //        Session.set('counter', Session.get('counter') + 1);
    //    }
    //});
}


if (Meteor.isServer) {

    Meteor.startup(function () {

        var converter = Meteor.npmRequire('satoshi-bitcoin');
        console.log('One Bitcoin equals ' + converter.toSatoshi(parseFloat("0.00010000")));

    });

    Meteor.methods({
        checkAddressBalance: function () {
            if (!Meteor.userId()) {
                throw new Meteor.Error("not-authorized");
            }

            var username = Meteor.user().username;
            var userBitcoinAddress = UsersBitcoin.find({owner: username}).fetch()[0]["address"];

            this.unblock();
            var url = "https://insight.bitpay.com/api/addr/" + userBitcoinAddress + "/utxo?noCache=2"
            console.log(url);
            return Meteor.http.call("GET", url);
        },
        getBitcoinAddress: function () {
            if (!Meteor.userId()) {
                throw new Meteor.Error("not-authorized");
            }

            var username = Meteor.user().username;
            return UsersBitcoin.find({owner: username}).fetch()[0]["address"];

        }
    });


    Accounts.onCreateUser(function (options, user) {
        var bitcoin = Meteor.npmRequire('bitcoinjs-lib');

        function rng() {
            var length = 32;
            var ret = [];
            while (ret.length < length) {
                ret.push(Math.floor(Math.random() * 31) + 1);
            }
            return new Buffer(ret)
        }

        var keyPair = bitcoin.ECPair.makeRandom({rng: rng});
        var address = keyPair.getAddress();
        var wif = keyPair.toWIF();

        UsersBitcoin.insert({
            owner: user["username"],
            address: address,
            wif: wif
        });

        return user
    })
}
