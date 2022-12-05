import { Post, User } from "../../mongoDB";
import { validateUpdatePostData } from "../../validators/post-validators";
import { checkAndParseDate } from "../../validators/genericValidators";
import { IUser } from "../../mongoDB/models/User";
import { Document } from "mongoose";

export async function searchPostsByQuery(
  queryFromReq: any
): Promise<
  import("mongoose").LeanDocument<
    { [x: string]: any } & Required<{ _id: unknown }>
  >[]
> {
  try {
    const { name, number, country, date_lost } = queryFromReq;
    // parseo el número del documento para sacarle los símbolos:
    let numberOnDocParsed;
    if (typeof number === "string") {
      numberOnDocParsed = number.replace(/[^A-Za-z0-9]/g, "").toLowerCase();
    }

    // date_lost tiene que ser menor o igual que date_found para que matchee.
    // La parseo con DateTime para chequear si es una fecha válida y que salte un error si no lo es:
    let verifiedDate = checkAndParseDate(date_lost);

    // mongoose automáticamente compara la fecha yyyy-MM-dd correctamente contra la ISO de la DB. Pero igualmente intento parsearla con Luxon para que chequee si es una fecha válida o no. Si no lo es, tirará error. Si lo es, aprovecho y la uso para la query, pero es lo mismo que usar la date yyyy-MM-dd que viene por query.
    // El name se compara automáticamente con un "iLike". No hace falta pasarla a minúscula.
    const postsFound = await Post.find(
      {
        $and: [
          {
            $or: [
              { name_on_doc: { $eq: name } },
              { number_on_doc: { $eq: numberOnDocParsed } },
            ],
          },
          { country_found: { $eq: country } },
          { date_found: { $gte: verifiedDate } },
        ],
      },
      {
        _id: 1,
        "user_posting.posts": 0,
        "user_posting.createdAt": 0,
        "user_posting.updatedAt": 0,
        "user_posting.additional_contact_info": 0,
      }
    )
      .lean()
      .exec();
    return postsFound;
  } catch (error: any) {
    console.log(`Error en fn aux search Posts By Query`);
    throw new Error(error.message);
  }
}

// UPDATE A POST :
export async function handleUpdatePost(
  post_id: string | undefined,
  reqFromBody: any,
  user_id: string | undefined
) {
  if (!post_id || !user_id) {
    throw new Error(
      `El id de la publicación y el id del usuario deben ser válidos.`
    );
  }
  const validatedData = validateUpdatePostData(reqFromBody);
  const postInDB = await Post.findById(post_id).exec();
  const userInDB = await User.findById(user_id).exec();
  if (postInDB === null) {
    throw new Error(
      `Post con id "${post_id}" no fue encontrado en la base de datos.`
    );
  }
  if (userInDB === null) {
    throw new Error(
      `Usuario con id "${user_id} no fue encontrado en la base de datos.`
    );
  }
  if (postInDB.user_posting._id !== userInDB._id) {
    throw new Error(
      `El id del post no pertenece al usuario que desea modificarlo.`
    );
  }

  let response = {
    userPost: 0,
    postCollection: 0,
    total: 0,
    msg: "",
    status: 200,
  };

  try {
    // editar en collection Post:
    postInDB.name_on_doc = validatedData.name_on_doc;
    postInDB.number_on_doc = validatedData.number_on_doc;
    postInDB.country_found = validatedData.country_found;
    postInDB.date_found = validatedData.date_found;
    postInDB.blurred_imgs = validatedData.blurred_imgs;
    postInDB.comments = validatedData.comments;
    postInDB.user_posting.additional_contact_info =
      validatedData.additional_contact_info;
    await postInDB.save();
    response.postCollection++;
    response.total++;
    // editar en User.posts:
    let userPost = userInDB.posts.id(post_id);
    if (userPost) {
      userPost.name_on_doc = validatedData.name_on_doc;
      userPost.number_on_doc = validatedData.number_on_doc;
      userPost.country_found = validatedData.country_found;
      userPost.date_found = validatedData.date_found;
      userPost.blurred_imgs = validatedData.blurred_imgs;
      userPost.comments = validatedData.comments;
      userPost.user_posting.additional_contact_info =
        validatedData.additional_contact_info;
      await userInDB.save();
      response.userPost++;
      response.total++;
    }
  } catch (error: any) {
    response.msg = error.message;
    response.status = 400;
  } finally {
    return response;
  }
}

// DELETE POST :
export async function findPostByIdAndDeleteIt(
  post_id: string | undefined,
  user_id: string | undefined
) {
  if (!post_id || !user_id) {
    throw new Error(`El id del Post y el id del usuario deben ser válidos.`);
  }
  //borrar post en el user_posts y en collection Post
  const userInDB = await User.findById(user_id).exec();
  const postInDB = await Post.findById(post_id).exec();

  if (userInDB === null) {
    throw new Error(
      `Usuario con id "${user_id}" no encontrado en la base de datos.`
    );
  }
  if (postInDB === null) {
    throw new Error(
      `Post con id "${post_id}" no encontrado en la base de datos.`
    );
  }

  if (postInDB.user_posting._id !== userInDB._id) {
    throw new Error(
      `El post que se quiere eliminar no pertenece al usuario con id "${user_id}"`
    );
  }

  let response = {
    userPosts: 0,
    postCollection: 0,
    total: 0,
    msg: "",
    status: 200,
  };

  try {
    // buscar y borrar post de User.posts:
    let userPostRemoved = await userInDB.posts.id(post_id)?.remove();
    if (userPostRemoved) {
      console.log(
        "chequeo si el post ya fue removido antes de hacer el await userInDB.save() = ",
        userInDB
      );

      await userInDB.save();
      console.log(
        "después del userInDB.save(), consologueo el userInDB = ",
        userInDB
      );

      response.userPosts++;
      response.total++;
    }
    // buscar y borrar documento en collection Post:
    const deletedPost = await Post.findByIdAndDelete(post_id).exec();
    if (deletedPost) {
      response.postCollection++;
      response.total++;
    }
  } catch (error: any) {
    response.status = 400;
    response.msg = error.message;
  } finally {
    return response;
  }
}

export function checkContactsDate(user_contacting: IUser) {
  if (
    Array.isArray(user_contacting.contacts) &&
    user_contacting.contacts.length >= 5
  ) {
    // check date of the oldest contact: Si tiene más de 24hs, le permito. Si el último tiene menos de 24hs, tiro error:
    let dateNow = Date.now();
    let oldestContact = user_contacting.contacts[0];
    let timeFromOldestContact = dateNow - oldestContact;

    if (timeFromOldestContact <= 86400000) {
      throw new Error(`Too many contacts in the last 24hs.`);
    }
  }
}

// ADD CONTACT "TIMESTAMP" TO USER CONTACTING :
export async function addContactDateToUserContacting(
  user_contacting: Document<unknown, any, IUser> &
    IUser &
    Required<{ _id: string }>
) {
  if (
    Array.isArray(user_contacting.contacts) &&
    user_contacting.contacts.length >= 5
  ) {
    user_contacting.contacts.shift();
    user_contacting.contacts.push(Date.now());
    await user_contacting.save();
    console.log("Contact shifteado y pusheado");
  } else {
    if (
      Array.isArray(user_contacting.contacts) &&
      user_contacting.contacts.length < 5
    ) {
      user_contacting.contacts.push(Date.now());
      await user_contacting.save();
      console.log("Contact pusheado");
    }
  }
}
