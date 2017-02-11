/* Any copyright is dedicated to the Public Domain.
 * http://creativecommons.org/publicdomain/zero/1.0/ */

var crypto = require('crypto')
var dbServer = require('../../fxa-auth-db-server')
var test = require('tap').test
var log = require('../lib/log')
var DB = require('../../lib/db/mysql')(log, dbServer.errors)
var fake = require('../../fxa-auth-db-server/test/fake')
var config = require('../../config')

var TOKEN_NEW_AGE = 2 * 24 * 60 * 60 * 1000 // 2 days

DB.connect(config)
  .then(
    function (db) {

      test(
        'ping',
        function (t) {
          t.plan(1)
          return db.ping()
          .then(function(account) {
            t.pass('Got the ping ok')
          }, function(err) {
            t.fail('Should not have arrived here')
          })
        }
      )

      test(
        'prune tokens',
        function (t) {
          t.plan(13)
          var user = fake.newUserDataBuffer()
          var unblockCode = crypto.randomBytes(4).toString('hex')
          return db.createAccount(user.accountId, user.account)
            .then(function() {
              return db.createPasswordForgotToken(user.passwordForgotTokenId, user.passwordForgotToken)
            })
            .then(function() {
              return db.forgotPasswordVerified(user.accountResetTokenId, user.accountResetToken)
            })
            .then(function () {
              return db.createUnblockCode(user.accountId, unblockCode)
            })
            .then(function() {
              // now set it to be older than prune date
              var sql = 'UPDATE accountResetTokens SET createdAt = createdAt - ? WHERE tokenId = ?'
              return db.write(sql, [TOKEN_NEW_AGE, user.accountResetTokenId])
            })
            .then(function(sdf) {
              return db.createPasswordForgotToken(user.passwordForgotTokenId, user.passwordForgotToken)
            })
            .then(function() {
              // now set it to be older than prune date
              var sql = 'UPDATE passwordForgotTokens SET createdAt = createdAt - ? WHERE tokenId = ?'
              return db.write(sql, [TOKEN_NEW_AGE, user.passwordForgotTokenId])
            })
            .then(function() {
              // now set it to be older than prune date
              var sql = 'UPDATE unblockCodes SET createdAt = createdAt - ? WHERE uid = ?'
              return db.write(sql, [3, user.accountId])
            })
            .then(function() {
              // prune older tokens
              return db.pruneTokens()
            })
            .then(function() {
              // now check that all tokens for this uid have been deleted
              return db.accountResetToken(user.accountResetTokenId)
            })
            .then(function(accountResetToken) {
              t.fail('The above accountResetToken() call should fail, since the accountResetToken has been deleted')
            }, function(err) {
              t.equal(err.code, 404, 'accountResetToken() fails with the correct code')
              t.equal(err.errno, 116, 'accountResetToken() fails with the correct errno')
              t.equal(err.error, 'Not Found', 'accountResetToken() fails with the correct error')
              t.equal(err.message, 'Not Found', 'accountResetToken() fails with the correct message')
            })
            .then(function() {
              return db.passwordForgotToken(user.passwordForgotTokenId)
            })
            .then(function(passwordForgotToken) {
              t.fail('The above passwordForgotToken() call should fail, since the passwordForgotToken has been pruned')
            }, function(err) {
              t.equal(err.code, 404, 'passwordForgotToken() fails with the correct code')
              t.equal(err.errno, 116, 'passwordForgotToken() fails with the correct errno')
              t.equal(err.error, 'Not Found', 'passwordForgotToken() fails with the correct error')
              t.equal(err.message, 'Not Found', 'passwordForgotToken() fails with the correct message')
            })
            .then(function() {
              var sql = 'SELECT * FROM unblockCodes WHERE uid = ?'
              return db.readFirstResult(sql, [Buffer(user.accountId)])
            })
            .then(function() {
              t.fail('The above readFirstResult() should not find the unblock code')
            }, function(err) {
              t.equal(err.code, 404, 'readFirstResult() fails with the correct code')
              t.equal(err.errno, 116, 'readFirstResult() fails with the correct errno')
              t.equal(err.error, 'Not Found', 'readFirstResult() fails with the correct error')
              t.equal(err.message, 'Not Found', 'readFirstResult() fails with the correct message')
            })
            .then(function(token) {
              t.pass('No errors found during tests')
            }, function(err) {
              t.fail(err)
            })
        }
      )

      test(
        'teardown',
        function (t) {
          return db.close()
        }
      )

    }
  )
