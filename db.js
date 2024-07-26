const mongoose = require('mongoose');
const User = require('./schema.js');

module.exports= async function handleDb(replId,isActive){

    try{
       const result=await User.findOneAndUpdate(
        {projectId:replId},
        {isActive:isActive,lastModified:Date.now()},
        {new:true}
       )
    }
    catch(err){
        console.log(err)
    }

}