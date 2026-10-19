import type { Course } from '../types/course'

export interface StaticCourse extends Course {
  code: string
  title: string
  description: string
}

export const COURSES: StaticCourse[] = [
  {
    id: 'c1',
    name: 'Веб-разработка',
    code: 'CS-WEB',
    title: 'Веб-разработка',
    description: 'Практический курс веб-разработки: React, TypeScript, Node.js и Supabase.',
  },
  {
    id: 'c2',
    name: 'Базы данных',
    code: 'CS-DB',
    title: 'Базы данных',
    description: 'Проектирование реляционных баз данных, язык SQL, транзакции и оптимизация запросов.',
  },
  {
    id: 'c3',
    name: 'Операционные системы',
    code: 'CS-OS',
    title: 'Операционные системы',
    description: 'Управление процессами, виртуальной памятью, синхронизация потоков и архитектура ОС.',
  },
  {
    id: 'c4',
    name: 'Алгоритмы и структуры данных',
    code: 'CS-ALG',
    title: 'Алгоритмы и структуры данных',
    description: 'Деревья, графы, алгоритмические парадигмы и анализ вычислительной сложности.',
  },
  {
    id: 'c5',
    name: 'Компьютерные сети',
    code: 'CS-NET',
    title: 'Компьютерные сети',
    description: 'Сетевые протоколы, модель OSI, стек TCP/IP, маршрутизация и информационная безопасность.',
  },
]
