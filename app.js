const express = require("express");
const app = express();

app.set("view engine", "ejs");
app.use(express.static("public"));

const request = require("request");
const mysql = require("mysql");
const bcrypt = require("bcrypt");
const session = require("express-session");

const ac_tools = require("./ac_tools.js");
const mc_tools = require("./mc_tools.js");
const rs_tools = require("./rs_tools.js");
const ia_tools = require("./ia_tools.js");

//------------------------------------
//    Alejandro Server Routes
//------------------------------------

app.use(session({
    secret: "top secret!",
    resave: true,
    saveUninitialized: true
}));

app.use(express.urlencoded({ extended: true }));

app.get("/", function (req, res) {
    req.session.authenticated = false;
    res.render("index");
});

app.post("/ac_login", async function (req, resp) {

    if (req.session.authenticated == false) {
        //var dbConn = ac_tools.createSqlDb_connection();
        var sqlQuery = ac_tools.get_isValidUser_SQL();
        var sqlParams = [req.body.ac_username];
        var sqlResults = await ac_tools.sendQuery_getResults(sqlQuery, sqlParams);

        if (typeof sqlResults != "undefined") {
            var authenticated = await ac_tools.ac_checkPassword(req.body.ac_pass, sqlResults.password);
            var isAdmin = ac_tools.process_isAdmin( sqlResults.adminPriv );
            req.session.authenticated = authenticated;
            req.session.isAdmin = isAdmin;
            req.session.username = req.body.ac_username;
            console.log("Is the user the admin = " + isAdmin);

            /* Randy - Get user id */
            sql = "SELECT userID FROM users WHERE userName = ?";
            sqlParams = [req.session.username];
            
            rs_tools.query(sql, sqlParams).then(function(rows) {
                req.session.userID = rows[0].userID;
                console.log("UserID: " + req.session.userID);
                req.session.save();
            });
            /* End Randy */
        } else {
            var authenticated = false;
            var isAdmin = false;
        }
    }

    //Required authentication bools
    //var authenticated = true;   //replaced with function above
    //var isAdmin = true;         //replaced with function above
    //req.session.username = req.body.ac_username;
    //req.session.authenticated = authenticated;
    //req.session.isAdmin = isAdmin

    if (req.session.authenticated) {

        var newsURL = "https://spaceflightnewsapi.net/api/v1/articles";
        var NASA_apod_url = "https://api.nasa.gov/planetary/apod?api_key=Op29RUimOTEUSA4IotMbJePAnn3cXR47rFYY8KJY";
        var apiData = await ac_tools.sendNewsAPI_request(newsURL);
        var apodData = await ac_tools.sendAPODapi_request(NASA_apod_url);

        resp.render("login_page", {
            "username": req.session.username,
            "titles": apiData.title,
            "urls": urls,
            "imgUrls": apiData.imgUrl,
            "numToDisplay": 8,
            "apodImgUrl": apodData.apodURL,
            "apodTitle": apodData.apodTitle,
            "apodCopyright": apodData.apodCopyright,
            "isAdmin": req.session.isAdmin
        });

    } else {
        // not authenticated goes here:
        resp.render("index", { "loginError": true })
    }

});

app.get("/logout", function (req, res) {
    console.log("From inside /logout path: User chose to log out");
    req.session.destroy();
    res.redirect("/");
});

//------------------------------------
//    END Alejandro Server Routes
//------------------------------------

//------------------------------------
//    BEGIN Ivan Admin Page Route
//------------------------------------
app.get("/adminPage", isAuthenticated, async function (req, res) {
    //var conn = ia_tools.createSqlDb_connection();
    var sql = "SELECT * FROM products";
    var results;

    results = await ia_tools.sendQuery(sql, []);
    res.render("adminPage", { "adminName": req.session.username, "rows": results });
});

app.get("/api/adminPage", isAuthenticated, async function (req, res) {
    var sql = "SELECT * FROM products";
    var results;

    if (req.query.action == "requestItem") {
        var sqlPull = "SELECT * FROM products WHERE itemID=?";
        var sqlParams = [req.query.itemID];
        results = await ia_tools.sendQuery(sqlPull, sqlParams);
        res.send(results);
    } else if (req.query.action == "redrawTable") {
        var sql = "SELECT * FROM products";
        results = await ia_tools.sendQuery(sql, []);
        res.send(results);
    } else if (req.query.action == "report") {
        let queryType = req.query.query;
        let specifier = req.query.specifier;
        let sql, param; // need?
        var error;

        if (queryType == 'popular') {
            sql = "SELECT products.itemID, itemName, SUM(itemquantity) as 'total_units' FROM products INNER JOIN detailedtransactions ON products.itemID = detailedtransactions.itemID GROUP BY itemID ORDER BY SUM(itemquantity)";
            if (specifier == 'most') {
                sql += " DESC";

            } else if (specifier == 'least') {
                sql += " ASC";
            }

        } else if (queryType == 'price') {
            sql = "SELECT itemID, itemName, price FROM products WHERE price = (select";
            if (specifier == 'high') {
                sql += " max(price) from products)";
            } else if (specifier == 'low') {
                sql += " min(price) from products)";
            }
        } else if (queryType == 'transaction') {
            sql = "SELECT transID, price_total, userName, users.userID FROM users INNER JOIN generaltransactions ON users.userID = generaltransactions.userID ORDER BY price_total";
            if (specifier == 'most') {
                sql += " DESC LIMIT 10";
            } else if (specifier == 'average') {
                sql = "SELECT userID, ROUND(AVG(price_total), 0) as 'average_usertotal', COUNT(*) as 'total_transactions' FROM generaltransactions GROUP BY userID";
            } else if (specifier == 'least') {
                sql += " ASC LIMIT 10";
            }
        } 
        results = await ia_tools.sendQuery(sql, []).catch(err => {error = err}).catch(err => {console.log(err)});

        if (error) {
            console.log(error)
        } else {
            res.send(results);
        }
        
    } else {
        results = await ia_tools.sendQuery(sql, []);
        res.render("adminPage", { "adminName": req.session.username, "rows": results });
    }
});

app.post("/adminPage", isAuthenticated, async function (req, res) {
    let itemID = req.body.itemID;
    let itemName = req.body.itemName;
    let price = req.body.price;
    let description = req.body.description;
    let tags = req.body.tags;
    let type = req.body.submitType;

    if (type == "add") {
        var sqlAdd = "INSERT INTO products VALUES (default, ?, ?, ?, ?)";
        var sqlParamsAdd = [itemName, price, description, tags];
        await ia_tools.postQuery(sqlAdd, sqlParamsAdd).catch(err => {console.log(err)});
    } else if (type == "update") {
        var sqlUpdate = "UPDATE products SET itemName=?, price=?, description1=?, description2=? WHERE itemID=?";
        var sqlParamsUpdate = [itemName, price, description, tags, itemID];
        await ia_tools.postQuery(sqlUpdate, sqlParamsUpdate).catch(err => {console.log(err)});
    } else if (type == "delete") {
        var sqlDelete = "DELETE FROM products WHERE itemID=?";
        var sqlParamsDelete = [itemID];
        await ia_tools.postQuery(sqlDelete, sqlParamsDelete).catch(err => {console.log(err)});
    }

    var sql = "SELECT * FROM products";
    var results = await ia_tools.sendQuery(sql, []);
    res.render("adminPage", { "adminName": "ivan", "rows": results });
});
//------------------------------------
//    END Ivan Admin Page Route
//------------------------------------

//------------------------------------
//    START Matt Checkout Route
//------------------------------------

//Button to preview and load the checkout webpage
app.get("/checkoutPreview", isAuthenticated, async function (req, res) {
  let userid = req.session.userID;
  let totalCost = "";
  //var conn = ia_tools.createSqlDb_connection();
  var sql = "SELECT products.itemName, products.price, usercart.itemquantity FROM `usercart` INNER JOIN `products` ON usercart.itemID = products.itemID WHERE userID = ?";
  var calcTotal = "SELECT SUM(products.Price * usercart.itemquantity) AS totalCost FROM products JOIN usercart ON products.itemID = usercart.itemID WHERE userID = ?";

  var result = await ia_tools.sendQuery(calcTotal,[userid]);
  totalCost = result[0].totalCost;
  
  var results = await ia_tools.sendQuery(sql, [userid]);
    
  res.render("checkout", {"rows": results, "totalCost":totalCost});
});//getCheckout

//Button to finalize checkout and add transaction
app.get("/checkoutButton", isAuthenticated, async function (req, res) {
  let userid = req.session.userID;
  let transid, totalCost;
  //var conn = ia_tools.createSqlDb_connection();
  var calcTotal = "SELECT SUM(products.Price * usercart.itemquantity) AS totalCost FROM products JOIN usercart ON products.itemID = usercart.itemID WHERE userID = ?";
  var submitTrans = "INSERT INTO `generaltransactions` (transID, userID, trans_ts, price_total) VALUES (default, ?, CURRENT_TIMESTAMP, ?)";
  var getLatestTransID = "SELECT * FROM generaltransactions ORDER BY transID DESC LIMIT 1";
  var submitOrder = "INSERT INTO `detailedtransactions` (transID, itemID, itemquantity) SELECT ?, itemID, itemquantity FROM usercart WHERE userID = ?";
  var clearUsercart = "DELETE FROM usercart WHERE userID = ?";
  
  //get total from the UserCart
  var result = await ia_tools.sendQuery(calcTotal,[userid]);
  totalCost = result[0].totalCost;
  
  //create new transaction and get new transII
  await ia_tools.postQuery(submitTrans, [userid, totalCost]);
  var results = await ia_tools.sendQuery(getLatestTransID, []);
  transid = results[0].transID;
  
  //submit order by moving data from UserCart to DetailedTransactions table
  await ia_tools.postQuery(submitOrder, [transid, userid, userid]);
  await ia_tools.postQuery(clearUsercart, [userid]);
  
  res.render("checkoutFinished", {"transid":transid});
});//finalize checkout

//------------------------------------
//    END Matt Checkout Route
//------------------------------------

//------------------------------------
//    START Randy Product Search, Cart page
//------------------------------------
app.get("/search", isAuthenticated, function(req, res) {
    res.render("search");
});

app.get("/cart", isAuthenticated, function(req, res) {
    var sql = "", sqlParams = [];
    req.session.userID = 1;
    // Get user's cart
    sql = "SELECT itemID, itemName, price, itemQuantity, description1 FROM usercart NATURAL JOIN products WHERE userID = ?;";
    sqlParams = [req.session.userID];
    // Execute query
    rs_tools.query(sql, sqlParams).then(function(rows) {
        res.render("cart", {rows: rows});
    });
    
});


/**
 * querySearch - Query database for items based on input
 * params: querySearch - query string to look for
 *       : action - list returns all products, if empty then it falls to filters
 *       : searchOptions - filter options (itemName, price, description)
 */
app.get("/api/querySearch", isAuthenticated, function (req, res) {
    var sql = "", sqlParams = [];

    // Check which search parameters were passed and generate
    // SQL query from there
    if (req.query.searchOptions.length > 0) {
        if (req.query.searchOptions.indexOf("itemName") > -1) {
            sql = "SELECT * FROM products WHERE LOWER(itemName) LIKE ?"
            sqlParams.push('%'+req.query.querySearch.toLowerCase()+'%');
        }
        if (req.query.searchOptions.indexOf("price") > -1) {
            if (sql.length > 0)
                sql += " UNION SELECT * FROM products WHERE price LIKE ?"
            else
                sql = "SELECT * FROM products WHERE price LIKE ?"
            sqlParams.push('%'+req.query.querySearch+'%');
        }
        if (req.query.searchOptions.indexOf("description") > -1) {
            if (sql.length > 0)
                sql += " UNION SELECT * FROM products WHERE LOWER(description2) LIKE ?"
            else
                sql = "SELECT * FROM products WHERE LOWER(description2) LIKE ?"
            sqlParams.push('%'+req.query.querySearch.toLowerCase()+'%');
        }
    }

    if (req.query.action == "list") {
        sql = "SELECT * FROM products;";
        sqlParams = [];
    }

    // Execute query
    rs_tools.query(sql, sqlParams).then(function(rows) {
        res.send(rows);
    });
});

app.get("/api/getCart", isAuthenticated, function(req, res) {
    sql = "SELECT itemName, price, itemQuantity, description1 FROM usercart NATURAL JOIN products WHERE userID = ?;";
    sqlParams = [req.query.userID];

    // Execute query
    rs_tools.query(sql, sqlParams).then(function(rows) {
        res.send(rows);
    });
});


/** 
 * cartAction
 * Add/update items in user's cart
 * params: action - add, update, delete
 *       : itemID, itemQuantity
 */
app.get("/api/cartAction", isAuthenticated, function (req, res) {
    var comboSQL, updateSQL, insertSQL, deleteSQL;
    var comboSQLParams, updateSQLParams, insertSQLParams, deleteSQLParams;

    // Foul play checking
    if (req.query.itemQuantity < 0) {
        req.query.itemQuantity = 0;
    }
    // Query returns item quantity for a user and an item
    comboSQL = "SELECT itemQuantity FROM usercart WHERE userID = ? AND itemID = ?"
    comboSQLParams = [req.session.userID, req.query.itemID];

    // Update quantity
    updateSQL = "UPDATE usercart SET itemQuantity = ? WHERE userID = ? AND itemID = ?"
    updateSQLParams = [req.query.itemQuantity, req.session.userID, req.query.itemID];

    // Add new item to cart
    insertSQL = "INSERT INTO usercart VALUES (?, ?, ?)"
    insertSQLParams = [req.session.userID, req.query.itemID, req.query.itemQuantity];

    // Delete item from cart
    deleteSQL = "DELETE FROM usercart WHERE userID = ? AND itemID = ?";
    deleteSQLParams = [req.session.userID, req.query.itemID];

    // Check if item exists in cart
    if (req.query.action == "add") {
        rs_tools.query(comboSQL, comboSQLParams).then(function(rows) {
            if (rows.length == 0)
                // Insert item into user's cart
                rs_tools.query(insertSQL, insertSQLParams).then(function(rows) {
                    res.send("Added item to cart!");
                });
            else { 
                // Item already exists in cart, so find what new quantity should now be
                let newItemQty = parseInt(rows[0].itemQuantity) + parseInt(req.query.itemQuantity);
                updateSQLParams = [newItemQty, req.session.userID, req.query.itemID];
                console.log(updateSQLParams);
                rs_tools.query(updateSQL, updateSQLParams).then(function(rows) {
                    res.send("Updated item in cart!")
                });

            }
        });
    } else if (req.query.action == "update") {
        rs_tools.query(updateSQL, updateSQLParams).then(function(rows) {
            res.send("Updated item in cart!");
        });
    } else if (req.query.action == "delete") {
        rs_tools.query(deleteSQL, deleteSQLParams).then(function(rows) {
            res.send("Removed item from cart!");
        });
    }
});

// API using SQL to calculate subtotal
app.get("/api/getCartSubtotal", isAuthenticated, function(req, res) {
    sql = "SELECT SUM(price * itemQuantity) subTotal FROM products NATURAL JOIN usercart WHERE userID = ?;";
    sqlParams = [req.session.userID];

    // Execute query
    rs_tools.query(sql, sqlParams).then(function(rows) {
        res.send(rows);
    });
});

// Middleware function to check authentication
function isAuthenticated(req, res, next) {
    if (!req.session.authenticated)
        res.redirect("/");
    else
        next();
}

//------------------------------------
//    END Randy Product Search, Cart page
//------------------------------------

//------------------------------------
//    Server Listeners
//------------------------------------

// codeanywhere uses 0.0.0.0
// app.listen("8081", "0.0.0.0", function () {
//     console.log("Express server is running...")
// });


// local machine uses 127.0.0.1
/*app.listen("8081", "127.0.0.1", function () {
    console.log("Express server is running...")
});*/

// Heroku Environ
app.listen(process.env.PORT, process.env.IP, function () {
    console.log("Express server is running...")
})
