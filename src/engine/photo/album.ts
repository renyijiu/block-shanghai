// 相册：照片存 IndexedDB（图片是 Blob，localStorage 放不下），存档里只记照片 id（docs/02 第 6 节）
const DB = 'block-shanghai'
const STORE = 'photos'
const VERSION = 1

export interface PhotoMeta {
  id: string
  city: string
  /** 现实拍摄时间（ISO） */
  takenAt: string
  /** 游戏时间（秒） */
  gameTime: number
  filter: string
  /** 识别出的景点和子景点 id */
  landmarks: string[]
  width: number
  height: number
  /** 缩略图（JPEG） */
  thumb: Blob
}

export interface PhotoRecord extends PhotoMeta {
  image: Blob
}

function request<T>(r: IDBRequest<T>) {
  return new Promise<T>((resolve, reject) => {
    r.onsuccess = () => resolve(r.result)
    r.onerror = () => reject(r.error)
  })
}

export class Album {
  private readonly db: IDBDatabase

  private constructor(db: IDBDatabase) {
    this.db = db
  }

  /** 打开相册；浏览器不支持或隐私模式打不开时抛错，调用方提示“照片无法保存” */
  static async open(): Promise<Album> {
    const r = indexedDB.open(DB, VERSION)
    r.onupgradeneeded = () => {
      const store = r.result.createObjectStore(STORE, { keyPath: 'id' })
      store.createIndex('city', 'city')
    }
    return new Album(await request(r))
  }

  private store(mode: IDBTransactionMode) {
    return this.db.transaction(STORE, mode).objectStore(STORE)
  }

  async add(photo: PhotoRecord) {
    await request(this.store('readwrite').put(photo))
  }

  async get(id: string): Promise<PhotoRecord | null> {
    return (await request(this.store('readonly').get(id))) ?? null
  }

  /** 某个城市的全部照片（不含原图），新的在前 */
  async list(city: string): Promise<PhotoMeta[]> {
    const all: PhotoRecord[] = await request(this.store('readonly').index('city').getAll(city))
    return all.map(({ image: _image, ...meta }) => meta).sort((a, b) => b.takenAt.localeCompare(a.takenAt))
  }

  async delete(id: string) {
    await request(this.store('readwrite').delete(id))
  }

  close() {
    this.db.close()
  }
}

/** 新照片 id：时间 + 随机后缀 */
export const newPhotoId = () => `p${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`
