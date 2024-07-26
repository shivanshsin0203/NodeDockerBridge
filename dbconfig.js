const mongoose = require('mongoose');
const mongoUrl = process.env.mongoUrl;
module.exports= async function initDb(){
    try{
        await mongoose.connect(mongoUrl)
    }
    catch(err){
        console.log(err)
    }
}