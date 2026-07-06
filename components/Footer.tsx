import { logoutAccount } from '@/lib/actions/user.actions'
import Image from 'next/image'
import { useRouter } from 'next/navigation'
import React from 'react'
import { toast } from 'sonner'

const Footer = ({user,type="desktop"}:FooterProps) => {
    const router =useRouter();
    const handleLogOut =async ()=>{
       try {
         const loggedOut = await logoutAccount();
         if(loggedOut){
           toast.success("You've been signed out.");
           router.push('/sign-in');
         } else {
           toast.error("We couldn't sign you out. Please try again.");
         }
       } catch (error) {
         console.log(error);
         toast.error("Something went wrong while signing out.");
       }
    }
    return (
    <footer className='footer' >
        <div className={type==='mobile'?"footer_name-mobile":"fotter-name"}>
            <p className='text-xl font-bold text-gray-700'>   {user?.firstName[0]}</p>
        </div>
        <div className={type==='mobile'?
            "footer_email-mobile":"fotter-email"}>
                <h1 className='text-14 truncate  
                text-gray-600
                ' >
                    {user?.firstName}
                </h1>
                <p className='text-14 truncate font-normal
                text-gray-700 font-semibold
                ' >{user?.email}</p>
        </div>

        <div className='footer_image' onClick={handleLogOut} >
            <Image src="icons/logout.svg" fill alt="jsm" />
        </div>
    </footer>
  )
}

export default Footer