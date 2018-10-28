// 处理新的 promise 成功还是失败
const resolvePromise = (promise2, x, resolve, reject) => {
  // 自己不能等待自己
  if (x === promise2) {
    return reject(new TypeError('循环引用'))
  }
  // 这里的 promise 可能是别人写的, 有可能即调成功又调失败。所有要确保只调用一次
  // 在所有调用成功、失败前上锁
  let called
  // 如果是普通值，直接成功 
  if ((typeof x === 'function' || typeof x === 'object') && x !== null) {
    // 如果用户引用第三方模块导致不能正常取值
    try{
      let then = x.then
      if(typeof then === 'function'){ 
          // 此时才认为是 promise，并且执行的时候修改 this 指向
          then.call(x, (y) => {
            if(!called){ // 上锁
              called = true
            }else{
              return
            }
            console.log('then 内返回了 promise，并成功了')
            // resolve(y)
            // y可能还是一个promise,需要递归直到是一个常量为止
            resolvePromise(promise2, y, resolve, reject)
          }, (r) => {
            if(!called){ // 上锁
              called = true
            }else{
              return
            }
            console.log('then 内返回了 promise，并失败了')
            reject(r)
          })
      } else {
        if(!called){ // 上锁
          called = true
        }else{
          return
        }
        resolve(x)
      }
    }catch(e){
      if(!called){ // 上锁
        called = true
      }else{
        return
      }
      reject(e)
    }   
  } else {
    if(!called){ // 上锁
      called = true
    }else{
      return
    }
    return resolve(x)
  }
}

class Promise {
  constructor (executor) {
    this.value = undefined // 执行结果
    this.reject = undefined // 错误结果
    this.status = 'pending' // 状态 pending resolved rejected
    this.onResolvedCallback = [] // 记录成功回调
    this.onRejectdCallback = [] // 记录失败回调

    const resolve = (value) => {
      if (this.status === 'pending') {
        this.value = value
        this.status = 'resolved'
        console.log('resolve resolved')
        // 如果是异步，执行 then 同步添加进来的回调
        this.onResolvedCallback.forEach(f => f())
      }
    }
    const reject = (reject) => {
      if (this.status === 'pending') {
        this.reject = reject
        this.status = 'rejected'
        console.log('reject rejected')
        // 如果是异步，执行 then 同步添加进来的回调
        this.onRejectdCallback.forEach(f => f())
      }
    }

    // executor 报错就认为失败，并把失败原因传递下去
    // try{
    //   executor(resolve, reject)
    // }catch(e){
    //   reject(e)
    // }
    executor(resolve, reject)
  }

  then(onFulfilled, onRejected) {
    // 确保 onFulfilled onRejected 是一个方法，并且实现值穿透
    onFulfilled = typeof onFulfilled == 'function' ? onFulfilled : function (data) {
      return data;
    }
    onRejected = typeof onRejected === 'function' ? onRejected:function (err) {
      throw err;
    }

    const self = this

    // 创建新的 promise 并返回，链式调用
    let promise2
    promise2 = new Promise((resolve, reject) => {
      // 上个promise为同步 ====================================================
      if (self.status === 'resolved') {
        setTimeout(() => { // onFulfilled、onRejected 不能在当前栈中执行
          try { // 异步方法不能被 catch ，所有在定时器内 catch
            const x = onFulfilled(self.value)
            resolvePromise(promise2, x, resolve, reject)
          } catch(e) {
            reject(e)
          }
        }, 0)
      }
      if (self.status === 'rejected') {
        setTimeout(() => { // onFulfilled、onRejected 不能在当前栈中执行
          try { // 异步方法不能被 catch ，所有在定时器内 catch
            const x = onRejected(self.reject)
            resolvePromise(promise2, x, resolve, reject)
          } catch(e) {
            reject(e)
          }
        }, 0)
      }
      // 上个promise为异步 ====================================================
      if (self.status === 'pending') {
        self.onResolvedCallback.push(() => {
          setTimeout(() => { // 这里本来就是异步，可以不加定时器
            try { // 异步方法不能被 catch ，所有在定时器内 catch
              const x = onFulfilled(self.value)
              resolvePromise(promise2, x, resolve, reject)
            } catch(e) {
              reject(e)
            }
          }, 0)
        })
        self.onRejectdCallback.push(() => {
          setTimeout(() => { // 这里本来就是异步，可以不加定时器
            try { // 异步方法不能被 catch ，所有在定时器内 catch
              const x = onRejected(self.reject)
              resolvePromise(promise2, x, resolve, reject)
            } catch(e) {
              reject(e)
            }
          }, 0)
        })
      }
    })

    return promise2
  }

  catch(onRejected) {
    return this.then(null, onRejected)
  }

  // finally(callback) { // 不管成功失败都会执行
  //   return this.then(callback, callback)
  // }
  finally(callback) { // 不管成功失败都会执行,并且值穿透,如果callback执行结果是Promise也会等待
    return this.then((data) => {
      return new Promise(() => callback()).then(() => data) // 回调函数不接受任何参数
    }, (data) => {
      return new Promise(() => callback()).then(null, () => {throw data})
    })
  }
  finally2(callback) { // 不管成功失败都会执行,并且值穿透,如果callback执行结果是Promise也会等待
    return this.then((data) => {
      return Promise.resolve(callback()).then(() => data) // 这种写法需要手动执行一下
    }, (data) => {
      return Promise.reject(callback()).then(null, () => {throw data})
    })
  }
}

Promise.resolve = (value) => {
  return new Promise((resolve, reject) => {
    resolve(value)
  })
}
Promise.reject = (value) => {
  return new Promise((resolve, reject) => {
    reject(value)
  })
}

Promise.all = (promises) => { // 只考虑数组中的都是Promise
  return new Promise((resolve, reject) => {
    const arr = []
    let currentIndex = 0
    const length = promises.length
    promises.forEach((promise, i) => {
      promise.then((value) => {
        arr[i] = value
        currentIndex++
        if (length === currentIndex) { // 判断是否都执行完成
          resolve(arr)
        }
      }, reject) // 有一个失败就都失败
    })
  })
}

// 成功失败取决于最快的那个
Promise.race = (promises) => {
  return new Promise((resolve, reject) => {
    promises.forEach((promise) => {
      promise.then(resolve, reject)
    })
  })
}

// 测试代码要求
Promise.defer = Promise.deferred = function () {
  let dfd = {};
  dfd.promise = new Promise((resolve, reject)=>{
    dfd.resolve = resolve;
    dfd.reject = reject
  })
  return dfd
}

module.exports = Promise
