UsersBitcoin = new Mongo.Collection("usersBitcoin");
SpentTx = new Mongo.Collection("spentTx");
createdRecords = new Mongo.Collection("createdRecords");

// Todo
// after tx is broadcasted, enter the tx that was spent into SpentTx db
// after tx is broadcasted, enter the tx that was created into createdRecords

function byteCount(s) {
    return encodeURI(s).split(/%..|./).length - 1;
}

if (Meteor.isClient) {
    var getBitcoinStatus = function () {
        Meteor.call("checkAddressBalance", function (error, results) {
            if (results.data.length > 0) {

                var filtered_txs = [];

                //remove any spent tx's
                for (var i = 0; i < results.data.length; i++) {
                    var amountInDb = SpentTx.find({tx: results.data[i].txid}).fetch()
                    console.log(amountInDb);
                    if (amountInDb.length > 0) {
                        console.log("need to remove this one")
                    } else {
                        filtered_txs.push(results.data[i])
                    }

                }

                if (filtered_txs.length < 1) {
                    Meteor.call("getBitcoinAddress", function (error, result) {
                        console.log(result);
                        Session.set("hasInputs", false);

                        Session.set("depositBitcoin", result);
                    });

                } else {
                    Session.set("hasInputs", filtered_txs);
                    Session.set("depositBitcoin", false);
                }

            } else {
                Meteor.call("getBitcoinAddress", function (error, result) {
                    console.log(result);
                    Session.set("depositBitcoin", result);
                });

            }
        });
    };


    Accounts.ui.config({
        passwordSignupFields: "USERNAME_ONLY"
    });

    if (Meteor.userId()) {
        Tracker.autorun(function () {
            if (Meteor.userId()) {
                getBitcoinStatus()
            }
        });
        Session.set("hasInputs", false);
        Session.set("depositBitcoin", false);

        getBitcoinStatus();


        Template.body.helpers({
            hasInputs: function () {
                console.log(Session.get("hasInputs"));
                return Session.get("hasInputs");
            },
            depositBitcoin: function () {
                return Session.get("depositBitcoin");
            },
            pushedHash: function () {
                return Session.get("pushedHash")
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
                var message = Session.get("opReturnMessage");
                var input_tx = Session.get("selectedTx");

                if (!input_tx) {
                    return alert("please select a tx")
                }

                if (!message || message === "") {
                    return alert("please enter a message")
                }

                var byteAmount = unescape(encodeURIComponent(message)).length


                console.log(byteAmount)
                if (byteAmount > 40) {
                    return alert("your string is too big")
                }

                Meteor.call("publishOPReturnMessage", message, input_tx, function (error, result) {
                    console.log(result);
                    Session.set("pushedHash", result);
                    getBitcoinStatus();
                });

            }
        });
    }
}


if (Meteor.isServer) {

    var converter = Meteor.npmRequire('satoshi-bitcoin');
    var bitcoin = Meteor.npmRequire('bitcoinjs-lib');

    var rng = function () {
        var length = 32;
        var ret = [];
        while (ret.length < length) {
            ret.push(Math.floor(Math.random() * 31) + 1);
        }
        return new Buffer(ret)
    };

    Meteor.methods({
        checkAddressBalance: function () {
            if (!Meteor.userId()) {
                throw new Meteor.Error("not-authorized");
            }

            var username = Meteor.user().username;
            var userBitcoinAddress = UsersBitcoin.find({owner: username}).fetch()[0]["address"];

            this.unblock();
            var url = "https://insight.bitpay.com/api/addr/" + userBitcoinAddress + "/utxo?noCache=2"
            return Meteor.http.call("GET", url);
        },
        publishOPReturnMessage: function (message, input_tx) {

            var input_txid = input_tx.txid;
            var input_vout = input_tx.vout;
            var amount = input_tx.amount;
            var data = new Buffer(message);
            var username = Meteor.user().username;
            var wif = UsersBitcoin.find({owner: username}).fetch()[0]["wif"];

            var tx = new bitcoin.TransactionBuilder();
            tx.addInput(input_txid, input_vout);
            var dataScript = bitcoin.script.nullDataOutput(data);
            tx.addOutput(dataScript, 0);

            // give some to the miners
            tx.addOutput('136KE23Y18iSUHLKvhS1AfmFEviz7ts5bQ', (converter.toSatoshi(amount) / 2))

            tx.sign(0, bitcoin.ECPair.fromWIF(wif));

            var txRaw = tx.build().toHex();

            this.unblock();

            var url =  "http://api.blockcypher.com/v1/btc/main/txs/push";

            var result = Meteor.http.post(url, {
                data: {tx: txRaw}
            });

            console.log(result.content);
            console.log(result.data);

            var hash = result.data.tx.hash

            SpentTx.insert({
                tx: input_txid
            });

            createdRecords.insert({
                rawtx: txRaw,
                owner: Meteor.user().username
            })


            return hash;


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
