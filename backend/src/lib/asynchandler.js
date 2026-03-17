function asyncHandler(cb) {
  return async function (req, res) {
    try {
      const result = await cb(req,res);
      return result;
    } catch (error) {
      console.log(error)
      return res.status(500).json({ msg: "Internal Server Error" });
    }
  };
}


module.exports = {asyncHandler}