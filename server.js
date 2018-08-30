const express = require('express');
const bodyParser = require('body-parser');
const bcrypt = require('bcrypt-nodejs');
const cors = require('cors');
const knex = require('knex');
const multer = require('multer');
const path = require('path');

// database
const db = knex({
    client: 'pg',
    connection: {
        host: '127.0.0.1',
        user: 'postgres',
        password: 'lalaqp123',
        database: 'nove-list'
    }
});

//set storage engine
const storage = multer.diskStorage({
    destination: './public/uploads/',
    filename: (req, file, cb) => {
        cb(null, file.fieldname + '-' + Date.now() + path.extname(file.originalname));
    }
})

//Init upload
const upload = multer({
    storage: storage,
    limits: {fileSize: 1000000},
    fileFilter: (req, file, cb) => {
        checkFileType(file, cb);
    }
}).single('myImage');

//Check File Type
checkFileType = (file, cb) => {
    //Allowed ext
    const filetypes = /jpeg|jpg|png|gif/;
    //Check ext
    const extname = filetypes.test(path.extname(file.originalname).toLowerCase());
    //Check mime
    const mimetype = filetypes.test(file.mimetype);

    if(mimetype && extname){
        return cb(null, true);
    }else{
        cb('Error: Images Only');
    }
}

const app = express();

app.use(bodyParser.json());
app.use(cors());

//Public Folder
app.use(express.static('./public'));

//signin
app.post('/signin', (req, res) => {
    const { email } = req.body
    db.select('email', 'hash').from('login')
        .where('email', '=', email)
        .then( data => {
            const isValid = bcrypt.compareSync(req.body.password, data[0].hash);
            if(isValid){
                return db.select('*').from('users')
                    .where('email', '=', email)
                    .then( user => {
                        res.json(user[0])
                    })
                    .catch( err => res.json('unable to get user'))
            }else{
                res.json('wrong credentials')
            }
        })
        .catch(err => res.status(400).json('wrong credentials'))
})

//register
app.post('/register', (req, res) => {
    const { email, name, password} = req.body;
    if(email === '' || name === '' || password === ''){
        res.json("Empty input")
    }else{
    const hash = bcrypt.hashSync(password);
        db.transaction( trx => {
            trx.insert({
                hash: hash,
                email: email
            })
            .into('login')
            .returning('email')
            .then(loginEmail => {
                // console.log(loginEmail)
                return trx('users')
                .returning('*')
                .insert({
                    email: loginEmail[0],
                    name: name,
                    joined: new Date()
                })
                .then(user => {
                    res.json(user[0]);
                })
                .then(trx.commit)
                .catch(trx.rollback)
            })
        })
        .catch( err => res.status(400).json('unable to register'))
    }
})

//get popular data
app.post('/display-book', (req, res) => {
    const { value } = req.body;
    if(value === 0){
        db.select('id_book').from('story').orderBy('views', 'desc')
            .then( id => {
                const idBook = id.map( idBook => {
                    return idBook.id_book
                })
                res.json({
                    id_book: idBook
                })
            })
            .catch( err => res.json('cant get popular'))
    }else if( value === 1){
        db.select('id_book').from('story').orderBy('likes', 'desc')
        .then( id => {
            const idBook = id.map( idBook => {
                return idBook.id_book
            })
            res.json({
                id_book: idBook
            })
        })
        .catch( err => res.json('cant get popular'))
    }else{
        db.select('id_book').from('story').orderBy('id_book', 'desc')
            .then( id => {
                const idBook = id.map( idBook => {
                    return idBook.id_book
                })
                res.json({
                    id_book: idBook
                })
            })
    }
    
    
})

//search book
app.post('/search-book', (req, res) => {
    const {search } = req.body;
    db.select('id_book').from('story').where('title', '=', search)
    .orderBy(['views', 'likes'], 'desc')
    .then(data => console.log(data))
})

//insert book to library
app.post('/insert-to-library', (req, res) => {
    const { id, id_book } = req.body;
    db('users').where('id', '=', id)
    .update({
        library: db.raw('array_append(library, ?)', [id_book])
    })
    .then( books => {
        res.json('success')
        }
    )
    .catch( err => res.json( "cant insert to library"))
})

//create new story
app.post('/new-story', (req, res) => {
    const { title, category, description, mature, imageData, id} = req.body;
        if(title === '' || category === '' || description === '' ){
            db('users').where('id', '=', id)
            .increment('stories', 0)
            .returning('stories')
            .then( story => {
                res.json('empty input')
            })
            .catch(err => res.json('cannot add new story'))
        }else{
            db('users').where('id', '=', id)
            .increment('stories', 1)
            .returning('stories')
            .then( story => {
                db('story').where('id_user', '=', id)
                .returning(['id_book','title', 'category', 'description', 'mature', 'entry', 'cover'])
                .insert({
                    title: title,
                    category: category,
                    description: description,
                    mature: mature,
                    entry: story[0],
                    cover: imageData,
                    id_user: id
                })
                .then( newStory => {
                    res.json(newStory[0])
                })
                .catch(err => res.json('cannot entry story'))
            })
            .catch( err => res.json('cannot input the data'))
        }     
})

//upload cover story
app.post('/upload-cover', (req, res) => {
    // console.log('handling upload image');
    upload( req, res, (err) => {
        if(err){
            // console.log('first err', err);
            res.send({
                msg: err
            });
        }else{
            if(req.file === undefined){
                // console.log('Error: No File Selected');
                res.send({
                    msg: 'Error: No File Selected'
                });
            }else{
                // console.log('File Uploaded');
                res.send({
                    msg: 'File Uploaded',
                    file: `uploads/${req.file.filename}`
                });
            }
        }
    });
});


//create new chapter
app.post('/new-chapter', (req, res) => {
    const { id_book, id, titleChapter, editorState, status } = req.body;
    if(titleChapter === '' || editorState === ''){
        db('story').where('id_user', '=', id_book)
            .increment('chapter', 0)
            .returning('chapter')
            .then( chapter => { 
                res.json('empty input')
            })
            .catch( err => res.json('cannot add chapter'))
    }else{
        db('story').where('id_book', '=', id_book)
            .increment('chapter', 1)
            .returning('chapter')
            .then( chapter => {
                db.select('entry').from('story').where('id_book', id_book)
                    .then( entry => {
                        const entryChapter = entry[0].entry;
                        db('chapter').insert({
                            chapter: chapter[0],
                            titlechapter: titleChapter,
                            content: editorState,
                            id_user: id,
                            id_book: id_book, 
                            status: status,
                            entry: entryChapter,
                        })
                        .returning('*')
                        .then( newChapter => {
                            res.json(newChapter[0]);
                        })
                        .catch( err => res.json('cannot add new chapter'))
                    })
            })
            .catch( err => res.json('cannot add new chapter'))
    }
})

//get data for chapter info
app.post( '/chapter-info', (req, res) => {
    const { id, id_book } = req.body;
    db.select(['titlechapter', 'status', 'id_chapter']).from('chapter').where('id_book', '=', id_book)
        .orderBy('chapter', 'asc')
        .then( data => {
            const title = data.map( info => {
                return info.titlechapter
            });
            const status = data.map( info => {
                return info.status
            });
            const id_chapter = data.map( info => {
                return info.id_chapter
            });
            res.json({
                title: title,
                status: status, 
                idChapter: id_chapter
            })
        })
        .catch( err => res.json('cannot get chapter info')) 
})

// view chapter
app.post('/view-chapter', (req, res) => {
    const { titleCh, id_book, id_chapter} = req.body;
    db.select('title').from('story').where('id_book', '=', id_book)
    .then( data => {
        const title =  data[0].title;
        db.select(['titlechapter', 'content']).from('chapter').where({id_book: id_book, id_chapter:id_chapter})
        .then( data => {
            res.json({
                title: title,
                titlechapter: data[0].titlechapter,
                content: data[0].content
            })
        })
        .catch( err => res.json('cant get chapter'))
    })
    .catch( err => res.json('cant get title'))
    
})

//delete chapter
app.post('/delete-chapter', (req, res) => {
    const {id_book, id_chapter} = req.body;
    db('chapter').where({id_chapter: id_chapter}).del()
    .then( chapter => {
        res.json('delete chapter')
    })
    .catch( err => res.json('cant delete chapter'))
})

//edit chapter
app.post('/edit-chapter', (req, res) => {
    const { id_book, id_chapter } = req.body;
    db.select(['titlechapter', 'content']).from('chapter').where({id_book: id_book,  id_chapter: id_chapter})
    .then( oldchapter => {
        res.json(oldchapter[0])
    })
    .catch( err => res.json('couldn\'t get chapter' ))
})

//edit chapter data
app.put('/edit-chapter-data', (req, res)=> {
    const {id_book, id_chapter, titleChapter, editorState, status} = req.body;
    db.select(['titlechapter', 'content']).from('chapter').where({id_book: id_book, id_chapter: id_chapter})
        .returning(['titlechapter', 'content'])
        .update({
            titlechapter: titleChapter,
            content: editorState,
            status: status
        })
        .then( data => {
            res.json(data[0])
        })
        .catch( err => res.json('cannot edit chapter'))
})

//story list
app.post( '/story-list', (req, res) => {
    const { id_book } = req.body;
    db.select('entry').from('chapter').where({id_book: id_book})
        .then( newdata => {
            const entryInfo = newdata[newdata.length - 1].entry;
            db.select('titlechapter').from('chapter').where({id_book :id_book, entry: entryInfo,  status: 'published'} )
            .orderBy('titlechapter', 'asc')
            .then( data => {
                const title = data.map( info => {
                    return info.titlechapter 
                })
                db.select('title').from('story').where('id_book', '=', id_book).orderBy('entry', 'asc')
                    .then( data => {
                        const titleStory = data[data.length - 1].title;
                        res.json({
                            titleChapter: title,
                            titleStory: titleStory
                        })
                    })
                    .catch( err => res.json('cannot get title story'))
            })
            .catch( err => res.json('could\'nt get new data'))
        
    }
    )
    .catch( err => res.json('couldn\'t get data'))
})

// chapter content
app.post( '/content', (req, res) => {
    const { id_book, chapter } = req.body;
    db.select('content').from('chapter').where({id_book :id_book, titlechapter: chapter} )
    .then( data => {
        res.json(data[0].content)
    })
    .catch( err => res.json("can't get content"))
})

//profile-page
app.post('/profile', (req, res) => {
    const { id } = req.body;
    db.select(['name', 'about']).from('users').where('id', '=', id)
    .then( user => {
        if(user.length){
            res.json(user[0])
        }else{
            res.json("cant get user")
        }
    })
    .catch( err => res.json('error getting user'))  
})

//my books
agithubpp.post('/my-books', (req, res) => {
    const { id } = req.body;
    db.select('id_book').from('story').where('id_user', '=', id)
    .then( idBooks => {
        const idBook = idBooks.map( (idBook, i) => {
            return idBook.id_book
        })
            res.json({
                booksId: idBook,
            })
        })
        .catch( err => res.json('cant get user'))
})

//delete book
app.delete('/delete-book', (req, res) => {
    const {id_book} = req.body;
    db('story').where({id_book: id_book}).del()
    .then( book => {
        res.json('delete book')
    })
    .catch( err => res.json('cant delete chapter'))
})

//update book
app.post('/update-book', (req, res) => {
    const {id_book, id} = req.body;
    db.select('id_book').from('story').whereNot({id_book: id_book}).where({id_user: id})
    .then( idBooks => {
        const idBook = idBooks.map( (idBook, i) => {
            return idBook.id_book
        })
            res.json({
                booksId: idBook,
            })
        })
        .catch( err => res.json('cant get user'))
})

//my library
app.post('/my-library', (req, res) => {
    const { id } = req.body;
    console.log(id)
    db.select('library').from('users').where('id', '=', id)
    .then( library => {
        library.map( (idBook, i) => {
            console.log(idBook.library)
        } )
        
    })
    .catch( err => res.json("cant get id books"))
})


//edit profile
app.put('/edit-profile', (req, res) => {
    const { id, name, about, birthday, gender} = req.body;
    if(name || about || birthday || gender){
        db.select(['name', 'about', 'birthday', 'gender']).from('users').where('id', '=', id)
        .returning(['name', "about"])
        .update({
            name: name,
            about: about,
            birthday: birthday,
            gender: gender
        })
        .then( user => {
            if( user.length){
                res.json(user[0])
            }else{
                res.json('Not found')
            }
        })
    }else{
        res.json('theres no update')
    }
})

//display book
app.post( '/get-book-data', (req, res) => {
    const { id, id_book} = req.body;
    db.select(['title', 'description', 'mature', 'cover']).from('story').where('id_book', '=', id_book)
    .then( data => {
        res.json(data[0])
    })
    .catch( err => res.json("cant get book data "))
})

//insert views
app.post('/insert-views', (req, res) => {
    const {id_book, visit} = req.body;
    if(visit){
        db('story').where('id_book', '=', id_book)
        .increment('views', 1)
        .returning('views')
        .then( view => {
            res.json(view[0])
        })
        .catch( err => res.json('not visited'))
    }else{
        db('story').where('id_book', '=', id_book)
        .increment('views', 0)
        .returning('views')
        .then( view => {
            res.json(view[0])
        })
        .catch( err => res.json('not visited'))
    }
})

//display views
app.post('/views', (req, res) => {
    const { id_book} = req.body;

    db.select('views').from('story').where('id_book', '=', id_book)
    .then( views => {
        res.json(views[0].views)
    })
    .catch( err => res.json('cant get views'))
})

//insert likes
app.post('/insert-likes', (req, res) => {
    const {id_book, likes, updated } = req.body;
    if(!updated){
        db('story').where('id_book', '=', id_book)
        .increment('likes', likes)
        .returning('likes')
        .then( like => {
            res.json(like[0])
        })
        .catch(err => res.json('cannot add new story'))
    }else{
        db('story').where('id_book', '=', id_book)
        .decrement('likes', likes)
        .returning('likes')
        .then( like => {
            res.json(like[0])
        })
        .catch(err => res.json('cannot add new story'))
    }
})

app.post('/likes', (req, res) => {
    const { id_book} = req.body;
    db.select('likes').from('story').where('id_book', '=', id_book)
    .then( likes => {
        res.json(likes[0].likes)
    })
    .catch(err => res.json("cant get likes"))
})


//display totalchapter
app.post( '/total-chapter', (req,res) => {
    const { id_book} = req.body;
    db.select('titlechapter').from('chapter').where('id_book', '=', id_book)
    .then( total => {
        res.json(total.length)
        
    })
    .catch( err => res.json('cant get total chapter'))
})

app.listen('3001', () => {
    console.log('app is running on port 3001')
})

// / --> res = this is working
// /signin --> POST = successs/fail
// /register --> POST = user
// /profile/:userId --> GET = user
// /story --> POST = story
