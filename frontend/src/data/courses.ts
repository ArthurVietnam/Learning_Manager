import type { Course } from '../types/course'

export const COURSES: Course[] = [
  {
    id: 'c1',
    code: 'CS-WEB',
    title: 'Веб-разработка',
    description: 'Практический курс веб-разработки: React, TypeScript, Node.js и Supabase.',
  },
  {
    id: 'c2',
    code: 'CS-DB',
    title: 'Базы данных',
    description: 'Проектирование реляционных баз данных, язык SQL, транзакции и оптимизация запросов.',
  },
  {
    id: 'c3',
    code: 'CS-OS',
    title: 'Операционные системы',
    description: 'Управление процессами, виртуальной памятью, синхронизация потоков и архитектура ОС.',
  },
  {
    id: 'c4',
    code: 'CS-ALG',
    title: 'Алгоритмы и структуры данных',
    description: 'Деревья, графы, алгоритмические парадигмы и анализ вычислительной сложности.',
  },
  {
    id: 'c5',
    code: 'CS-NET',
    title: 'Компьютерные сети',
    description: 'Сетевые протоколы, модель OSI, стек TCP/IP, маршрутизация и информационная безопасность.',
  },
]
