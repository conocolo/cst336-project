//--------------------------------
// Tools for Ivan's admin page
//--------------------------------

// packages
const mysql = require('mysql');

module.exports = {

    createSqlDb_connection: function() {
        var conn = mysql.createConnection({
            host: "us-cdbr-iron-east-02.cleardb.net",
            user: "b91f42fc83bc56",
            password: "70d8e8dd",
            database: "heroku_32cdeda847586a8"
        });
        return conn;
    },

    sendQuery: function (sql, param) {
        var conn = this.createSqlDb_connection();
        return new Promise(function (resolve, reject) {
            conn.query(sql, param, function (err, results) {
                //if (err) throw err;
                if (!results || err) {
                    console.log("err: " + err);
                    return reject( err );
                } else {
                    resolve ( results );
                    conn.end();
                }
            });
        });
    },

    postQuery: function (sql, param) {
        var conn = this.createSqlDb_connection();
        return new Promise(function (resolve) {
            conn.query(sql, param, function (err) {
                if (err) {
                    console.log("err: " + err);
                    return reject(err);
                } else {
                    resolve();
                    conn.end();
                }

            });
        });
    }
};
